import { credentials, passkeys, recoveryCodes, totpFactors, users } from '@db/schema';
import { and, asc, count, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { toDataURL } from 'qrcode';
import { runAfterResponse } from '@/platform/background';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { getMailer } from '@/platform/mailer';
import { enforceRateLimit } from '@/platform/rate-limit';
import { audit } from './audit';
import { RATE, TOTP_SETUP_TTL_MS } from './config';
import { verifyPassword } from './crypto';
import { twoStepChangedMessage, type TwoStepChange } from './emails';
import {
  RECOVERY_CODE_COUNT,
  looksLikeRecoveryCode,
  newRecoveryCode,
  openSecret,
  recoveryCodeHash,
  sealSecret,
} from './factor-crypto';
import { revokeAllSessions } from './sessions';
import { matchTotp, newTotpSecret, totpUri } from './totp';

/**
 * Two-step sign-in (ADR-040). It is ON for an account that has a confirmed authenticator app OR at least one passkey;
 * then the password alone no longer signs in — it also needs an app code, a recovery code, or a passkey (a passkey on
 * its own is always enough). A password reset does NOT turn it off: whoever controls the mailbox still needs the second
 * step. Lose every factor and every recovery code, and the account cannot be recovered — the person was told so.
 */

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Conn = Db | Tx;

export interface TwoStepFactors {
  app: boolean;
  passkeys: number;
}

export async function factorsOf(userId: string, db: Conn = getDb()): Promise<TwoStepFactors> {
  const [[app], [keys]] = await Promise.all([
    db
      .select({ n: count() })
      .from(totpFactors)
      .where(and(eq(totpFactors.userId, userId), isNotNull(totpFactors.confirmedAt))),
    db.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, userId)),
  ]);
  return { app: (app?.n ?? 0) > 0, passkeys: keys?.n ?? 0 };
}

export const isOn = (f: TwoStepFactors): boolean => f.app || f.passkeys > 0;

export async function hasTwoStep(userId: string): Promise<boolean> {
  return isOn(await factorsOf(userId));
}

// ─── the second step at sign-in ──────────────────────────────────────────────────────────────────────────────────────

export const WRONG_CODE_MESSAGE =
  'That code isn’t right. Check the app (or the recovery code) and try again.';

/**
 * Called only once the password is proven. Does nothing for an account without two-step. Otherwise needs `code` — an app
 * code or an unused recovery code — and spends the per-account limit BEFORE checking it. Returns how it was passed.
 */
export async function requireSecondStep(
  userId: string,
  code: string | undefined,
  ctx: { requestId: string },
): Promise<'password' | 'app' | 'recovery'> {
  const factors = await factorsOf(userId);
  if (!isOn(factors)) return 'password';
  if (!code) {
    throw new AppError('SECOND_STEP_REQUIRED', {
      data: { app: factors.app ? 'yes' : 'no', passkey: factors.passkeys > 0 ? 'yes' : 'no' },
    });
  }
  await enforceRateLimit(`auth:second-step:${userId}`, RATE.secondStep);
  const trimmed = code.replace(/\s/g, '');
  if (/^\d{6}$/.test(trimmed) && factors.app && (await claimAppCode(userId, trimmed))) return 'app';
  if (looksLikeRecoveryCode(code) && (await claimRecoveryCode(userId, code))) {
    const left = await recoveryCodesLeft(userId);
    await audit('recovery_code_used', { userId, requestId: ctx.requestId, meta: { left } });
    notify(userId, 'recovery_code_used', `You have ${left} recovery code${left === 1 ? '' : 's'} left.`);
    return 'recovery';
  }
  await audit('second_step_failed', { userId, requestId: ctx.requestId });
  throw new AppError('UNAUTHENTICATED', {
    message: WRONG_CODE_MESSAGE,
    fields: { code: WRONG_CODE_MESSAGE },
  });
}

/**
 * Accept an app code at most once: the step it matched is written with a compare-and-set (`last_step < step`), so two
 * requests racing with the same code cannot both win, and a code seen over someone's shoulder is already spent.
 */
async function claimAppCode(userId: string, code: string, now: Date = new Date()): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ secretEnc: totpFactors.secretEnc, lastStep: totpFactors.lastStep })
    .from(totpFactors)
    .where(and(eq(totpFactors.userId, userId), isNotNull(totpFactors.confirmedAt)))
    .limit(1);
  if (!row) return false;
  const step = matchTotp(openSecret(row.secretEnc, userId), code, now.getTime(), row.lastStep);
  if (step === null) return false;
  const won = await db
    .update(totpFactors)
    .set({ lastStep: step })
    .where(
      and(
        eq(totpFactors.userId, userId),
        isNotNull(totpFactors.confirmedAt),
        or(isNull(totpFactors.lastStep), lt(totpFactors.lastStep, step)),
      ),
    )
    .returning({ userId: totpFactors.userId });
  return won.length > 0;
}

/** Single use, atomically (`used_at IS NULL` in the same UPDATE). */
async function claimRecoveryCode(userId: string, code: string): Promise<boolean> {
  const won = await getDb()
    .update(recoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(recoveryCodes.userId, userId),
        eq(recoveryCodes.codeHash, recoveryCodeHash(code)),
        isNull(recoveryCodes.usedAt),
      ),
    )
    .returning({ id: recoveryCodes.id });
  return won.length > 0;
}

async function recoveryCodesLeft(userId: string, db: Conn = getDb()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
  return row?.n ?? 0;
}

// ─── changing it (signed in, password typed again) ───────────────────────────────────────────────────────────────────

const WRONG_PASSWORD = 'That password is not right.';

/**
 * Every change to sign-in security asks for the password again: a session left open on someone else's phone must not be
 * enough to add the thief's own passkey or switch two-step off. Limited per account, spent before the check.
 */
export async function confirmPassword(userId: string, password: string): Promise<void> {
  await enforceRateLimit(`auth:security:${userId}`, RATE.securityChange);
  const [row] = await getDb()
    .select({ passwordHash: credentials.passwordHash })
    .from(credentials)
    .innerJoin(users, eq(users.id, credentials.userId))
    .where(and(eq(credentials.userId, userId), eq(users.status, 'active')))
    .limit(1);
  if (!row || !(await verifyPassword(row.passwordHash, password))) {
    throw new AppError('BAD_REQUEST', { message: WRONG_PASSWORD, fields: { password: WRONG_PASSWORD } });
  }
}

/** Email the owner about a change (after the response; a mail failure never undoes the change). */
export function notify(userId: string, change: TwoStepChange, extra?: string): void {
  runAfterResponse(`mail.two_step.${change}`, async () => {
    const [u] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (u) await getMailer().send(twoStepChangedMessage(u.email, change, extra));
  });
}

/** Replace the recovery codes with a fresh set and return them — the only time they are ever readable. */
async function issueRecoveryCodes(db: Conn, userId: string): Promise<string[]> {
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  await db.insert(recoveryCodes).values(codes.map((c) => ({ userId, codeHash: recoveryCodeHash(c) })));
  return codes;
}

export interface FactorAdded {
  /** Present when this factor turned two-step ON: the new recovery codes, shown once. */
  recoveryCodes?: string[];
}

/**
 * After the commit that added a factor. If it was the first one, two-step just turned on: sign out every OTHER device —
 * a session opened with the password alone must not outlive the switch (this is also what makes "staff need two-step"
 * mean every staff session passed it).
 */
export async function announceFactorAdded(
  userId: string,
  keepSessionId: string,
  added: 'passkey_added' | 'app_added',
  firstFactor: boolean,
  ctx: { requestId: string },
): Promise<void> {
  await audit(added, { userId, requestId: ctx.requestId });
  if (firstFactor) {
    const signedOut = await revokeAllSessions(userId, keepSessionId);
    await audit('two_step_on', { userId, requestId: ctx.requestId, meta: { signedOut } });
    notify(userId, 'turned_on');
  } else {
    notify(userId, added);
  }
}

/** Run after a factor was removed inside `tx`: if none is left, two-step is off and the recovery codes go with it. */
export async function afterFactorRemoved(tx: Tx, userId: string): Promise<{ lastFactor: boolean }> {
  const lastFactor = !isOn(await factorsOf(userId, tx));
  if (lastFactor) await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  return { lastFactor };
}

export async function announceFactorRemoved(
  userId: string,
  removed: 'passkey_removed' | 'app_removed',
  lastFactor: boolean,
  ctx: { requestId: string },
): Promise<void> {
  await audit(removed, { userId, requestId: ctx.requestId });
  if (lastFactor) {
    await audit('two_step_off', { userId, requestId: ctx.requestId });
    notify(userId, 'turned_off');
  } else {
    notify(userId, removed);
  }
}

// ─── the authenticator app ───────────────────────────────────────────────────────────────────────────────────────────

export interface AppSetup {
  /** The key, base32, for typing into the app by hand. */
  secret: string;
  /** otpauth:// — opens the authenticator app directly on a phone. */
  uri: string;
  /** The same link as a QR code (PNG data URL), for scanning from a computer screen. */
  qr: string;
}

/**
 * Start linking an authenticator app: a fresh secret, sealed, NOT yet counted (confirmedAt null) until a code from the
 * app proves it was saved. Starting again replaces an unfinished one. Refused if an app is already linked.
 */
export async function startApp(user: { id: string; handle: string }, password: string): Promise<AppSetup> {
  await confirmPassword(user.id, password);
  const db = getDb();
  const [existing] = await db
    .select({ confirmedAt: totpFactors.confirmedAt })
    .from(totpFactors)
    .where(eq(totpFactors.userId, user.id))
    .limit(1);
  if (existing?.confirmedAt) {
    throw new AppError('CONFLICT', { message: 'An authenticator app is already linked. Remove it first.' });
  }
  const secret = newTotpSecret();
  const secretEnc = sealSecret(secret, user.id);
  await db
    .insert(totpFactors)
    .values({ userId: user.id, secretEnc })
    .onConflictDoUpdate({
      target: totpFactors.userId,
      set: { secretEnc, createdAt: new Date(), lastStep: null },
      setWhere: isNull(totpFactors.confirmedAt),
    });
  const uri = totpUri(secret, user.handle);
  return { secret, uri, qr: await toDataURL(uri, { margin: 1, width: 240, errorCorrectionLevel: 'M' }) };
}

/** Finish linking: the first code from the app turns it on (and, if it is the first factor, two-step itself). */
export async function confirmApp(
  userId: string,
  sessionId: string,
  code: string,
  ctx: { requestId: string },
  now: Date = new Date(),
): Promise<FactorAdded> {
  await enforceRateLimit(`auth:second-step:${userId}`, RATE.secondStep);
  const db = getDb();
  const [row] = await db
    .select({ secretEnc: totpFactors.secretEnc, createdAt: totpFactors.createdAt })
    .from(totpFactors)
    .where(
      and(
        eq(totpFactors.userId, userId),
        isNull(totpFactors.confirmedAt),
        gt(totpFactors.createdAt, new Date(now.getTime() - TOTP_SETUP_TTL_MS)),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AppError('BAD_REQUEST', { message: 'That setup ran out of time. Start again.' });
  }
  const step = matchTotp(openSecret(row.secretEnc, userId), code.replace(/\s/g, ''), now.getTime(), null);
  if (step === null) {
    throw new AppError('BAD_REQUEST', { message: WRONG_CODE_MESSAGE, fields: { code: WRONG_CODE_MESSAGE } });
  }
  const result = await db.transaction(async (tx) => {
    const won = await tx
      .update(totpFactors)
      .set({ confirmedAt: now, lastStep: step })
      .where(and(eq(totpFactors.userId, userId), isNull(totpFactors.confirmedAt)))
      .returning({ userId: totpFactors.userId });
    if (won.length === 0) return null;
    return factorAddedIn(tx, userId);
  });
  if (!result) throw new AppError('CONFLICT', { message: 'An authenticator app is already linked.' });
  await announceFactorAdded(userId, sessionId, 'app_added', result.firstFactor, ctx);
  return result.recoveryCodes ? { recoveryCodes: result.recoveryCodes } : {};
}

/** Inside the adding transaction: is this the first factor? If so, the recovery codes are issued in the same commit. */
export async function factorAddedIn(
  tx: Tx,
  userId: string,
): Promise<{ firstFactor: boolean; recoveryCodes?: string[] }> {
  const f = await factorsOf(userId, tx);
  const firstFactor = (f.app ? 1 : 0) + f.passkeys === 1;
  return firstFactor ? { firstFactor, recoveryCodes: await issueRecoveryCodes(tx, userId) } : { firstFactor };
}

export async function removeApp(userId: string, password: string, ctx: { requestId: string }): Promise<void> {
  await confirmPassword(userId, password);
  const result = await getDb().transaction(async (tx) => {
    const gone = await tx
      .delete(totpFactors)
      .where(and(eq(totpFactors.userId, userId), isNotNull(totpFactors.confirmedAt)))
      .returning({ userId: totpFactors.userId });
    if (gone.length === 0) return null;
    return afterFactorRemoved(tx, userId);
  });
  if (!result) throw new AppError('NOT_FOUND', { message: 'No authenticator app is linked.' });
  await announceFactorRemoved(userId, 'app_removed', result.lastFactor, ctx);
}

/** A fresh set of recovery codes (the old ones stop working). Only while two-step is on. */
export async function renewRecoveryCodes(
  userId: string,
  password: string,
  ctx: { requestId: string },
): Promise<string[]> {
  await confirmPassword(userId, password);
  const codes = await getDb().transaction(async (tx) => {
    if (!isOn(await factorsOf(userId, tx))) return null;
    return issueRecoveryCodes(tx, userId);
  });
  if (!codes) throw new AppError('BAD_REQUEST', { message: 'Turn on two-step sign-in first.' });
  await audit('recovery_codes_renewed', { userId, requestId: ctx.requestId });
  notify(userId, 'recovery_codes_renewed');
  return codes;
}

// ─── what the Workshop shows ─────────────────────────────────────────────────────────────────────────────────────────

export interface TwoStepSummary {
  on: boolean;
  app: boolean;
  passkeys: { id: string; name: string; backedUp: boolean; createdAt: Date; lastUsedAt: Date | null }[];
  recoveryCodesLeft: number;
}

export async function twoStepSummary(userId: string): Promise<TwoStepSummary> {
  const db = getDb();
  const [factors, keys, left] = await Promise.all([
    factorsOf(userId),
    db
      .select({
        id: passkeys.id,
        name: passkeys.name,
        backedUp: passkeys.backedUp,
        createdAt: passkeys.createdAt,
        lastUsedAt: passkeys.lastUsedAt,
      })
      .from(passkeys)
      .where(eq(passkeys.userId, userId))
      .orderBy(asc(passkeys.createdAt)),
    recoveryCodesLeft(userId),
  ]);
  return { on: isOn(factors), app: factors.app, passkeys: keys, recoveryCodesLeft: left };
}
