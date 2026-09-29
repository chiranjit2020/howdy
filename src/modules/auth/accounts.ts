import { credentials, emailTokens, sessions, users } from '@db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { runAfterResponse } from '@/platform/background';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { logger } from '@/platform/logger';
import { getMailer } from '@/platform/mailer';
import { enforceRateLimit } from '@/platform/rate-limit';
import { passwordMatchesIdentity, IDENTITY_PASSWORD_MESSAGE } from '@/shared/validation/auth';
import { audit } from './audit';
import { recordAcceptance } from './legal';
import { closeAccount, deletionDate, isHandleHeld, keepAccount } from './deletion';
import { fileAppeal, suspensionAtSignIn, type SuspensionNotice } from '@/modules/moderation';
import { createProfile } from '@/modules/profiles';
import { RATE, RESET_PASSWORD_TTL_MS, VERIFY_EMAIL_TTL_MS } from './config';
import { dummyPasswordHash, hashPassword, hashToken, keyDigest, newToken, verifyPassword } from './crypto';
import {
  alreadyRegisteredMessage,
  passwordChangedMessage,
  passwordResetMessage,
  verifyEmailMessage,
} from './emails';
import { createSession, revokeSessionByToken } from './sessions';

type Db = ReturnType<typeof getDb>;
type Writer = Pick<Db, 'insert' | 'delete'>;

export interface RequestContext {
  requestId: string;
  /** Rate-limit key for the caller (see platform/http/client-ip). Never stored. */
  ip: string;
}

export const INVALID_CREDENTIALS_MESSAGE = 'That handle, email or password isn’t right.';
const INVALID_LINK_MESSAGE = 'That link is invalid or has expired. Ask for a fresh one.';

/** Name of the violated unique constraint for a Postgres 23505 error (also unwraps Drizzle's wrapper), if any. */
function uniqueViolation(err: unknown): string | undefined {
  for (let e: unknown = err, depth = 0; e && depth < 4; depth++) {
    const o = e as { code?: string; constraint?: string; cause?: unknown };
    if (o.code === '23505') return o.constraint ?? 'unknown';
    e = o.cause;
  }
  return undefined;
}

/** One live token per purpose per user: issuing a new one invalidates older unused ones. */
async function issueEmailToken(
  db: Writer,
  userId: string,
  purpose: 'verify_email' | 'reset_password',
  ttlMs: number,
): Promise<string> {
  await db
    .delete(emailTokens)
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt)));
  const { token, hash } = newToken();
  await db
    .insert(emailTokens)
    .values({ userId, purpose, tokenHash: hash, expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

// ─── Sign up ─────────────────────────────────────────────────────────────────

/**
 * Create an account. The response never reveals whether the EMAIL is already registered: the caller always sees
 * success, and a registered address instead receives an "already have an account" email. (Handles are public
 * identifiers, so "handle taken" is reported normally.) Password hashing always runs first so timing does not
 * separate the two cases, and mail is sent after the response.
 */
export async function signUp(
  input: { email: string; handle: string; password: string; displayName?: string | undefined },
  ctx: RequestContext,
): Promise<void> {
  await enforceRateLimit(`auth:signup:ip:${ctx.ip}`, RATE.signupIp);
  await enforceRateLimit(`auth:signup:email:${keyDigest(input.email)}`, RATE.signupEmail);

  const passwordHash = await hashPassword(input.password);
  const db = getDb();

  const handleTaken = () =>
    new AppError('CONFLICT', {
      message: 'Some fields need another look.',
      fields: { handle: 'That call sign is taken.' },
    });
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, input.handle))
    .limit(1);
  // A deleted account's call sign is held back for a while; it answers exactly like a taken one (ADR-027).
  if (taken || (await isHandleHeld(input.handle))) throw handleTaken();

  try {
    const created = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ email: input.email, handle: input.handle })
        .returning({ id: users.id });
      await tx.insert(credentials).values({ userId: u!.id, passwordHash });
      // Every account has a Ranch from the first moment (same transaction: no user without a profile, ever).
      await createProfile(tx, u!.id, input.displayName ?? input.handle);
      // The sign-up form required agreeing to the current Terms + Privacy Policy; the schema refuses anything else.
      await recordAcceptance(tx, u!.id);
      const token = await issueEmailToken(tx, u!.id, 'verify_email', VERIFY_EMAIL_TTL_MS);
      return { userId: u!.id, token };
    });
    await audit('signup', { userId: created.userId, requestId: ctx.requestId });
    runAfterResponse('mail.verify_email', async () =>
      getMailer().send(verifyEmailMessage(input.email, created.token)),
    );
  } catch (err) {
    const constraint = uniqueViolation(err);
    if (constraint?.includes('handle')) throw handleTaken(); // lost a race for the same handle
    if (constraint?.includes('email')) {
      runAfterResponse('signup.existing_email', () => handleExistingEmail(input.email));
      return;
    }
    throw err;
  }
}

async function handleExistingEmail(email: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select({ id: users.id, status: users.status, verified: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return;
  if (user.status === 'active' && !user.verified) {
    const token = await issueEmailToken(db, user.id, 'verify_email', VERIFY_EMAIL_TTL_MS);
    await getMailer().send(verifyEmailMessage(email, token));
  } else {
    await getMailer().send(alreadyRegisteredMessage(email));
  }
}

// ─── Email verification ──────────────────────────────────────────────────────

export async function verifyEmail(token: string, ctx: RequestContext): Promise<void> {
  await enforceRateLimit(`auth:token:ip:${ctx.ip}`, RATE.tokenIp);
  const now = new Date();
  const db = getDb();
  // Single atomic claim: only one caller can ever flip used_at for a given token.
  const userId = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.tokenHash, hashToken(token)),
          eq(emailTokens.purpose, 'verify_email'),
          isNull(emailTokens.usedAt),
          gt(emailTokens.expiresAt, now),
        ),
      )
      .returning({ userId: emailTokens.userId });
    if (!claimed) return null;
    await tx
      .update(users)
      .set({ emailVerifiedAt: now, updatedAt: now })
      .where(and(eq(users.id, claimed.userId), isNull(users.emailVerifiedAt)));
    return claimed.userId;
  });
  if (!userId) throw new AppError('BAD_REQUEST', { message: INVALID_LINK_MESSAGE });
  await audit('email_verified', { userId, requestId: ctx.requestId });
}

/** Always succeeds from the caller's point of view; the work happens after the response. */
export async function resendVerification(email: string, ctx: RequestContext): Promise<void> {
  await enforceRateLimit(`auth:resend:ip:${ctx.ip}`, RATE.resendIp);
  await enforceRateLimit(`auth:resend:email:${keyDigest(email)}`, RATE.resendEmail);
  runAfterResponse('resend_verification', async () => {
    const db = getDb();
    const [user] = await db
      .select({ id: users.id, status: users.status, verified: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user || user.status !== 'active' || user.verified) return;
    const token = await issueEmailToken(db, user.id, 'verify_email', VERIFY_EMAIL_TTL_MS);
    await getMailer().send(verifyEmailMessage(email, token));
  });
}

// ─── Password reset ──────────────────────────────────────────────────────────

/** Always succeeds from the caller's point of view (no account enumeration). */
export async function forgotPassword(email: string, ctx: RequestContext): Promise<void> {
  await enforceRateLimit(`auth:forgot:ip:${ctx.ip}`, RATE.forgotIp);
  await enforceRateLimit(`auth:forgot:email:${keyDigest(email)}`, RATE.forgotEmail);
  runAfterResponse('forgot_password', async () => {
    const db = getDb();
    const [user] = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user || user.status !== 'active') return;
    const token = await issueEmailToken(db, user.id, 'reset_password', RESET_PASSWORD_TTL_MS);
    await audit('password_reset_requested', { userId: user.id, requestId: ctx.requestId });
    await getMailer().send(passwordResetMessage(email, token));
  });
}

/**
 * Set a new password from an emailed token. On success: the token is burned (single use), the password is replaced,
 * the email counts as verified (the link proves control of it), and EVERY session is revoked so a thief holding an
 * old session is logged out. The user then signs in fresh.
 */
export async function resetPassword(
  input: { token: string; password: string },
  ctx: RequestContext,
): Promise<void> {
  await enforceRateLimit(`auth:token:ip:${ctx.ip}`, RATE.tokenIp);
  const now = new Date();
  const db = getDb();
  const tokenHash = hashToken(input.token);

  const [row] = await db
    .select({ userId: emailTokens.userId, email: users.email, handle: users.handle, status: users.status })
    .from(emailTokens)
    .innerJoin(users, eq(users.id, emailTokens.userId))
    .where(
      and(
        eq(emailTokens.tokenHash, tokenHash),
        eq(emailTokens.purpose, 'reset_password'),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row || row.status !== 'active') throw new AppError('BAD_REQUEST', { message: INVALID_LINK_MESSAGE });
  if (passwordMatchesIdentity(input.password, row.email, row.handle)) {
    throw new AppError('VALIDATION_FAILED', { fields: { password: IDENTITY_PASSWORD_MESSAGE } });
  }

  const newHash = await hashPassword(input.password);
  const done = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.tokenHash, tokenHash),
          eq(emailTokens.purpose, 'reset_password'),
          isNull(emailTokens.usedAt),
          gt(emailTokens.expiresAt, now),
        ),
      )
      .returning({ id: emailTokens.id });
    if (!claimed) return false; // someone else used it first
    await tx
      .insert(credentials)
      .values({ userId: row.userId, passwordHash: newHash })
      .onConflictDoUpdate({ target: credentials.userId, set: { passwordHash: newHash, updatedAt: now } });
    await tx
      .update(users)
      .set({ emailVerifiedAt: now, updatedAt: now })
      .where(and(eq(users.id, row.userId), isNull(users.emailVerifiedAt)));
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));
    await tx
      .delete(emailTokens)
      .where(
        and(
          eq(emailTokens.userId, row.userId),
          eq(emailTokens.purpose, 'reset_password'),
          isNull(emailTokens.usedAt),
        ),
      );
    return true;
  });
  if (!done) throw new AppError('BAD_REQUEST', { message: INVALID_LINK_MESSAGE });

  await audit('password_reset_completed', { userId: row.userId, requestId: ctx.requestId });
  runAfterResponse('mail.password_changed', async () => getMailer().send(passwordChangedMessage(row.email)));
}

// ─── Login ───────────────────────────────────────────────────────────────────

export interface LoginResult {
  token: string;
  maxAgeSec: number;
  user: { id: string; handle: string };
}

/**
 * Verify credentials and open a session. Unknown account and wrong password are indistinguishable (same error, same
 * Argon2 cost via a dummy hash). EMAIL_NOT_VERIFIED / ACCOUNT_UNAVAILABLE are only revealed AFTER the password was
 * proven correct. Any session presented with the request is revoked and a brand-new token is issued (no fixation).
 */
export async function login(
  input: { identifier: string; password: string },
  ctx: RequestContext & { userAgent?: string | null; previousToken?: string | undefined },
): Promise<LoginResult> {
  const row = await verifyCredentials(input, ctx);
  if (row.status === 'suspended') {
    // Only now, with the password proven: say why, and until when. A timed suspension that ran out lifts here.
    const at = await suspensionAtSignIn(row.id);
    if (!at.lifted) throw suspendedError(at.notice);
  } else if (row.status === 'pending_deletion') {
    // Only now, with the password proven: say when it goes, and offer to keep it (ADR-027).
    const deleteOn = await deletionDate(row.id);
    throw new AppError('ACCOUNT_CLOSING', { data: { deleteOn: deleteOn?.toISOString() ?? null } });
  } else if (row.status !== 'active') {
    throw new AppError('ACCOUNT_UNAVAILABLE');
  }
  if (!row.emailVerifiedAt) throw new AppError('EMAIL_NOT_VERIFIED');

  if (ctx.previousToken) await revokeSessionByToken(ctx.previousToken);
  const session = await createSession(row.id, ctx.userAgent);
  await audit('login_success', { userId: row.id, requestId: ctx.requestId });
  return { token: session.token, maxAgeSec: session.maxAgeSec, user: { id: row.id, handle: row.handle } };
}

function suspendedError(notice: SuspensionNotice): AppError {
  return new AppError('ACCOUNT_SUSPENDED', {
    data: { reason: notice.reason, endsAt: notice.endsAt?.toISOString() ?? null, appeal: notice.appeal },
  });
}

/**
 * A suspended person's one appeal (ADR-023). They cannot hold a session, so it is sent with the same identifier and
 * password as signing in, checked the same way and against the SAME rate limits (an appeal is not a second place to
 * guess passwords). Nothing about the account is said until the password is proven.
 */
export async function appealSuspension(
  input: { identifier: string; password: string; text: string },
  ctx: RequestContext,
): Promise<void> {
  const row = await verifyCredentials(input, ctx);
  if (row.status !== 'suspended')
    throw new AppError('BAD_REQUEST', { message: 'This account is not suspended.' });
  await fileAppeal(row.id, input.text);
  await audit('appeal_filed', { userId: row.id, requestId: ctx.requestId });
}

/**
 * "Keep my account" from the sign-in page (ADR-027): the same identifier and password as signing in, checked the same
 * way and against the same limits, then the scheduled deletion is cancelled. The caller signs in again afterwards.
 */
export async function keepClosingAccount(
  input: { identifier: string; password: string },
  ctx: RequestContext,
): Promise<void> {
  const row = await verifyCredentials(input, ctx);
  await keepAccount(row.id, ctx);
}

/**
 * Close my account from the sign-in page (ADR-027). A suspended person has no session, so this is how they use their
 * right to delete: the same identifier and password as signing in, the same checks and limits. Works for an active
 * account too (the same thing the Workshop does).
 */
export async function closeFromSignIn(
  input: { identifier: string; password: string },
  ctx: RequestContext,
): Promise<{ deleteOn: Date }> {
  const row = await verifyCredentials(input, ctx);
  const [u] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, row.id)).limit(1);
  return closeAccount(row.id, u!.email, ctx);
}

/**
 * The password check shared by sign-in and appeals. Unknown account and wrong password are indistinguishable (same
 * error, same Argon2 cost via a dummy hash). Returns the account whatever its status; the caller decides what to say.
 */
async function verifyCredentials(input: { identifier: string; password: string }, ctx: RequestContext) {
  await enforceRateLimit(`auth:login:ip:${ctx.ip}`, RATE.loginIp);
  await enforceRateLimit(`auth:login:id:${keyDigest(input.identifier)}`, RATE.loginIdentifier);

  const db = getDb();
  const byEmail = input.identifier.includes('@');
  const [row] = await db
    .select({
      id: users.id,
      handle: users.handle,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      passwordHash: credentials.passwordHash,
    })
    .from(users)
    .innerJoin(credentials, eq(credentials.userId, users.id))
    .where(byEmail ? eq(users.email, input.identifier) : eq(users.handle, input.identifier))
    .limit(1);

  const ok = await verifyPassword(row?.passwordHash ?? (await dummyPasswordHash()), input.password);
  if (!row || !ok) {
    logger.warn({
      event: 'auth.login_failed',
      requestId: ctx.requestId,
      identifierDigest: keyDigest(input.identifier),
    });
    if (row) await audit('login_failed', { userId: row.id, requestId: ctx.requestId });
    throw new AppError('UNAUTHENTICATED', { message: INVALID_CREDENTIALS_MESSAGE });
  }
  return row;
}
