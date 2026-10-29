import { timingSafeEqual } from 'node:crypto';
import { credentials, emailTokens, sessions, users } from '@db/schema';
import { and, desc, eq, gt, isNull, not } from 'drizzle-orm';
import { runAfterResponse } from '@/platform/background';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { logger } from '@/platform/logger';
import { getMailer } from '@/platform/mailer';
import { enforceRateLimit } from '@/platform/rate-limit';
import { passwordMatchesIdentity, IDENTITY_PASSWORD_MESSAGE } from '@/shared/validation/auth';
import { audit } from './audit';
import { recordAcceptance } from './legal';
import { closeAccount, deletionDate, isHandleHeld, keepAccount } from './deletion';
import { fileAppeal, suspensionAtSignIn, type SuspensionNotice } from '@/modules/moderation';
import { createProfile } from '@/modules/profiles';
import { RATE, RESET_PASSWORD_TTL_MS, VERIFY_CODE_TTL_MS, VERIFY_EMAIL_TTL_MS } from './config';
import { dummyPasswordHash, hashPassword, hashToken, keyDigest, newToken, verifyPassword } from './crypto';
import {
  alreadyRegisteredMessage,
  passwordChangedMessage,
  passwordResetMessage,
  verifyEmailMessage,
} from './emails';
import { emailCode, issueTicket, readTicket } from './factor-crypto';
import { verifyPasskeySignIn } from './passkeys';
import { createSession, revokeSessionByToken } from './sessions';
import { hasTwoStep, requireSecondStep } from './two-step';

type Db = ReturnType<typeof getDb>;
type Writer = Pick<Db, 'insert' | 'delete'>;

export interface RequestContext {
  requestId: string;
  /** Rate-limit key for the caller (see platform/http/client-ip). Never stored. */
  ip: string;
}

export const INVALID_CREDENTIALS_MESSAGE = 'That handle, email or password isn’t right.';
const INVALID_LINK_MESSAGE = 'That link is invalid or has expired. Ask for a fresh one.';
export const WRONG_EMAIL_CODE_MESSAGE = 'That code isn’t right, or it has expired. Check the email or send a new one.';

/** The confirmation email: one secret, sent as a button link and as the 6-digit code derived from it. */
const verifyMail = (email: string, handle: string, token: string) =>
  verifyEmailMessage(email, token, handle, emailCode(hashToken(token)));

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
 * Can this username be claimed right now? Asked while someone types on Create account, so they find out before they
 * submit. Same answer as sign-up gives: taken, or held back after a deletion (ADR-027), both read as "taken". Handles
 * are public, so this says nothing a profile page does not; emails are never checked here.
 */
export async function handleAvailable(handle: string, ctx: RequestContext): Promise<boolean> {
  await enforceRateLimit(`auth:handle-check:ip:${ctx.ip}`, RATE.handleCheckIp);
  const [taken] = await getDb().select({ id: users.id }).from(users).where(eq(users.handle, handle)).limit(1);
  return !taken && !(await isHandleHeld(handle));
}

/**
 * Create an account. The response never reveals whether the EMAIL is already registered: the caller always sees
 * success, and a registered address instead receives an "already have an account" email. (Handles are public
 * identifiers, so "handle taken" is reported normally.) Password hashing always runs first so timing does not
 * separate the two cases, and mail is sent after the response.
 *
 * An account that never confirmed this email never proved it owns it, so a new sign-up with the same email REPLACES it
 * (same transaction) instead of re-sending ITS confirmation. Otherwise someone could register another person's email
 * first, wait for them to sign up and click "confirm" on the squatter's account, and then lock them out with two-step
 * (a "pre-hijack"; security audit 2026-10-29, finding 1). It also lets a person who never confirmed simply start again
 * with the same username.
 */
export async function signUp(
  input: {
    email: string;
    handle: string;
    password: string;
    displayName?: string | undefined;
    invite?: string | undefined;
  },
  ctx: RequestContext,
): Promise<void> {
  await enforceRateLimit(`auth:signup:ip:${ctx.ip}`, RATE.signupIp);
  await enforceRateLimit(`auth:signup:email:${keyDigest(input.email)}`, RATE.signupEmail);

  const passwordHash = await hashPassword(input.password);
  const db = getDb();

  const handleTaken = () =>
    new AppError('CONFLICT', {
      message: 'Some fields need another look.',
      fields: { handle: 'That username is taken.' },
    });
  // The never-confirmed account of this same email is about to be replaced, so its username does not count as taken.
  const replaceable = and(eq(users.email, input.email), isNull(users.emailVerifiedAt), eq(users.status, 'active'));
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.handle, input.handle), not(replaceable!)))
    .limit(1);
  // A deleted account's call sign is held back for a while; it answers exactly like a taken one (ADR-027).
  if (taken || (await isHandleHeld(input.handle))) throw handleTaken();

  try {
    const created = await db.transaction(async (tx) => {
      // Rolled back with everything else if the insert below fails (e.g. the username was taken in a race).
      await tx.delete(users).where(replaceable);
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
      getMailer().send(verifyMail(input.email, input.handle, created.token)),
    );
    // Who listens (e.g. invite links, ADR-045) is not auth's business; it runs after the response either way.
    emit({ type: 'account.created', userId: created.userId, invite: input.invite ?? null });
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

/**
 * Create an account for someone who came from Google (ADR-048). The email is already verified by Google, so there is no
 * confirmation mail and no password (they can set one later with "Forgot password?"). Same profile, same Terms record
 * and the same events as a confirmed email sign-up, so invites and everything else behave identically.
 */
export async function signUpWithGoogle(
  input: { email: string; handle: string; displayName?: string | undefined; invite?: string | undefined },
  ctx: RequestContext,
): Promise<{ userId: string }> {
  await enforceRateLimit(`auth:signup:ip:${ctx.ip}`, RATE.signupIp);
  const db = getDb();
  const handleTaken = () =>
    new AppError('CONFLICT', {
      message: 'Some fields need another look.',
      fields: { handle: 'That username is taken.' },
    });
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, input.handle))
    .limit(1);
  if (taken || (await isHandleHeld(input.handle))) throw handleTaken();

  const now = new Date();
  let userId: string;
  try {
    userId = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ email: input.email, handle: input.handle, emailVerifiedAt: now })
        .returning({ id: users.id });
      await createProfile(tx, u!.id, input.displayName ?? input.handle);
      await recordAcceptance(tx, u!.id);
      return u!.id;
    });
  } catch (err) {
    const constraint = uniqueViolation(err);
    if (constraint?.includes('handle')) throw handleTaken();
    // Someone made an account with this email in the minutes since Google answered: send them to log in instead.
    if (constraint?.includes('email')) {
      throw new AppError('CONFLICT', {
        message: 'There is already a Howdy account with this email. Log in with Google to use it.',
      });
    }
    throw err;
  }
  await audit('signup', { userId, requestId: ctx.requestId, meta: { method: 'google' } });
  emit({ type: 'account.created', userId, invite: input.invite ?? null });
  emit({ type: 'account.verified', userId });
  return { userId };
}

/**
 * The account a Google-verified email belongs to, ready to sign in (ADR-048: linked automatically). If that account
 * never confirmed its email, whoever made it did not prove they own the address; Google just did. So its password is
 * removed and its sessions ended before it is handed over: nobody who registered someone else's email first can keep
 * a way in (a "pre-hijack"). Returns null when no account has this email.
 */
export async function claimAccountForGoogle(email: string, ctx: RequestContext): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: users.id, verified: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!row) return null;
  if (!row.verified) {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, row.id));
      await tx.delete(credentials).where(eq(credentials.userId, row.id));
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.userId, row.id), isNull(sessions.revokedAt)));
    });
    await audit('email_verified', { userId: row.id, requestId: ctx.requestId, meta: { method: 'google' } });
    emit({ type: 'account.verified', userId: row.id });
  }
  return row.id;
}

/**
 * The email belongs to a confirmed account (or a closing / suspended one): never-confirmed ones are replaced by signUp.
 * Its owner is told; nothing in the email can take the account over.
 */
async function handleExistingEmail(email: string): Promise<void> {
  const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (user) await getMailer().send(alreadyRegisteredMessage(email));
}

// ─── Email verification ──────────────────────────────────────────────────────

/**
 * Use a confirmation token once and mark the email confirmed. A single atomic claim: only one caller can ever flip
 * used_at for a given token, whether it came as the link or as the code. Returns the account, or null.
 */
async function claimVerifyToken(tokenHash: Buffer, now: Date): Promise<string | null> {
  return getDb().transaction(async (tx) => {
    const [claimed] = await tx
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.tokenHash, tokenHash),
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
}

export async function verifyEmail(token: string, ctx: RequestContext): Promise<void> {
  await enforceRateLimit(`auth:token:ip:${ctx.ip}`, RATE.tokenIp);
  const userId = await claimVerifyToken(hashToken(token), new Date());
  if (!userId) throw new AppError('BAD_REQUEST', { message: INVALID_LINK_MESSAGE });
  await audit('email_verified', { userId, requestId: ctx.requestId });
  emit({ type: 'account.verified', userId });
}

/**
 * Confirm the email with the 6-digit code from the confirmation email, typed on the page the person signed up on, and
 * sign them straight in. A code has only a million values, so: it works for 15 minutes; tries are limited per email
 * (5 per 15 minutes, 20 a day) and per source, spent BEFORE anything is looked up, so an address with no account
 * answers exactly like a wrong code; and it is compared in constant time. An account with two-step on (it cannot have
 * it yet, but never assume) is confirmed but not signed in: it logs in the usual way. Returns null in that case.
 */
export async function verifyEmailCode(
  input: { email: string; code: string },
  ctx: SessionCtx,
): Promise<LoginResult | null> {
  await enforceRateLimit(`auth:email-code:ip:${ctx.ip}`, RATE.emailCodeIp);
  await enforceRateLimit(`auth:email-code:email:${keyDigest(input.email)}`, RATE.emailCodeEmail);
  await enforceRateLimit(`auth:email-code:email-day:${keyDigest(input.email)}`, RATE.emailCodeEmailDay);
  const now = new Date();
  const wrong = () =>
    new AppError('BAD_REQUEST', { message: WRONG_EMAIL_CODE_MESSAGE, fields: { code: WRONG_EMAIL_CODE_MESSAGE } });

  // The newest live confirmation of this email, still inside the code's 15 minutes.
  const [row] = await getDb()
    .select({ tokenHash: emailTokens.tokenHash, handle: users.handle, status: users.status })
    .from(emailTokens)
    .innerJoin(users, eq(users.id, emailTokens.userId))
    .where(
      and(
        eq(users.email, input.email),
        eq(emailTokens.purpose, 'verify_email'),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, now),
        gt(emailTokens.createdAt, new Date(now.getTime() - VERIFY_CODE_TTL_MS)),
      ),
    )
    .orderBy(desc(emailTokens.createdAt))
    .limit(1);
  const want = Buffer.from(row ? emailCode(row.tokenHash) : '------');
  const got = Buffer.from(input.code.padEnd(6, '-').slice(0, 6));
  if (!row || !timingSafeEqual(want, got)) throw wrong();

  const userId = await claimVerifyToken(row.tokenHash, now);
  if (!userId) throw wrong(); // used a moment ago (the link, or a double tap)
  await audit('email_verified', { userId, requestId: ctx.requestId, meta: { method: 'code' } });
  emit({ type: 'account.verified', userId });

  if (row.status !== 'active' || (await hasTwoStep(userId))) return null;
  if (ctx.previousToken) await revokeSessionByToken(ctx.previousToken);
  const session = await createSession(userId, ctx.userAgent, undefined, { remember: ctx.remember });
  await audit('login_success', { userId, requestId: ctx.requestId, meta: { method: 'email_code' } });
  return { token: session.token, maxAgeSec: session.maxAgeSec, user: { id: userId, handle: row.handle } };
}

/** Always succeeds from the caller's point of view; the work happens after the response. */
export async function resendVerification(email: string, ctx: RequestContext): Promise<void> {
  await enforceRateLimit(`auth:resend:ip:${ctx.ip}`, RATE.resendIp);
  await enforceRateLimit(`auth:resend:email:${keyDigest(email)}`, RATE.resendEmail);
  runAfterResponse('resend_verification', async () => {
    const db = getDb();
    const [user] = await db
      .select({ id: users.id, handle: users.handle, status: users.status, verified: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user || user.status !== 'active' || user.verified) return;
    const token = await issueEmailToken(db, user.id, 'verify_email', VERIFY_EMAIL_TTL_MS);
    await getMailer().send(verifyMail(email, user.handle, token));
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
  /** Absent: a browser-session cookie ("Remember this device" was unticked). */
  maxAgeSec: number | undefined;
  user: { id: string; handle: string };
}

/** How someone proves who they are on the sign-in page (ADR-040). */
export type SignInProof =
  | { identifier: string; password: string; code?: string | undefined }
  /** A ticket from a sign-in that was complete but could not open a session (suspended / closing). */
  | { ticket: string }
  /**
   * Google proved this account (ADR-048): the id comes from a signed cookie the server set itself after checking
   * Google's answer, never from the request body. Two-step still applies, exactly as after a password.
   */
  | { googleUserId: string; code?: string | undefined };

type SessionCtx = RequestContext & {
  userAgent?: string | null;
  previousToken?: string | undefined;
  /** "Remember this device": a 30-day session (the default) or one that ends with the browser. */
  remember?: boolean | undefined;
};

/**
 * Verify credentials and open a session. Unknown account and wrong password are indistinguishable (same error, same
 * Argon2 cost via a dummy hash). The second step, then EMAIL_NOT_VERIFIED / ACCOUNT_UNAVAILABLE, are only asked for or
 * revealed AFTER the password was proven correct. Any session presented with the request is revoked and a brand-new
 * token is issued (no fixation).
 */
export async function login(input: SignInProof, ctx: SessionCtx): Promise<LoginResult> {
  const { row, method } = await proveAccount(input, ctx);
  return finishSignIn(row, method, ctx);
}

/** Sign in with a passkey: it proves the person AND stands in for the second step, so nothing else is asked. */
export async function passkeyLogin(
  input: Parameters<typeof verifyPasskeySignIn>[0],
  ctx: SessionCtx,
): Promise<LoginResult> {
  const row = await verifyPasskeySignIn(input, ctx);
  return finishSignIn(row, 'passkey', ctx);
}

interface ProvenAccount {
  id: string;
  handle: string;
  status: string;
  emailVerifiedAt: Date | null;
}

/**
 * The account has been fully proven (password + second step, a passkey, or a ticket). Say what is in the way, if
 * anything — and hand back a ticket with it, so the sign-in page can appeal, keep or close without asking again (an app
 * code works only once) — or open a session.
 */
async function finishSignIn(row: ProvenAccount, method: string, ctx: SessionCtx): Promise<LoginResult> {
  if (row.status === 'suspended') {
    // Only now, fully proven: say why, and until when. A timed suspension that ran out lifts here.
    const at = await suspensionAtSignIn(row.id);
    if (!at.lifted) throw suspendedError(at.notice, issueTicket(row.id));
  } else if (row.status === 'pending_deletion') {
    // Only now, fully proven: say when it goes, and offer to keep it (ADR-027).
    const deleteOn = await deletionDate(row.id);
    throw new AppError('ACCOUNT_CLOSING', {
      data: { deleteOn: deleteOn?.toISOString() ?? null, ticket: issueTicket(row.id) },
    });
  } else if (row.status !== 'active') {
    throw new AppError('ACCOUNT_UNAVAILABLE');
  }
  if (!row.emailVerifiedAt) throw new AppError('EMAIL_NOT_VERIFIED');

  if (ctx.previousToken) await revokeSessionByToken(ctx.previousToken);
  const session = await createSession(row.id, ctx.userAgent, undefined, { remember: ctx.remember });
  await audit('login_success', { userId: row.id, requestId: ctx.requestId, meta: { method } });
  return { token: session.token, maxAgeSec: session.maxAgeSec, user: { id: row.id, handle: row.handle } };
}

function suspendedError(notice: SuspensionNotice, ticket: string): AppError {
  return new AppError('ACCOUNT_SUSPENDED', {
    data: {
      reason: notice.reason,
      endsAt: notice.endsAt?.toISOString() ?? null,
      appeal: notice.appeal,
      ticket,
    },
  });
}

/**
 * A suspended person's one appeal (ADR-023). They cannot hold a session, so it is sent with the ticket their sign-in
 * returned — or the same identifier and password (and second step) as signing in, checked the same way and against the
 * SAME rate limits (an appeal is not a second place to guess passwords). Nothing is said until the account is proven.
 */
export async function appealSuspension(
  input: SignInProof & { text: string },
  ctx: RequestContext,
): Promise<void> {
  const { row } = await proveAccount(input, ctx);
  if (row.status !== 'suspended')
    throw new AppError('BAD_REQUEST', { message: 'This account is not suspended.' });
  await fileAppeal(row.id, input.text);
  await audit('appeal_filed', { userId: row.id, requestId: ctx.requestId });
}

/**
 * "Keep my account" from the sign-in page (ADR-027): proven the same way as signing in (or with its ticket), then the
 * scheduled deletion is cancelled. The caller signs in again afterwards (the ticket still works for that).
 */
export async function keepClosingAccount(input: SignInProof, ctx: RequestContext): Promise<void> {
  const { row } = await proveAccount(input, ctx);
  await keepAccount(row.id, ctx);
}

/**
 * Close my account from the sign-in page (ADR-027). A suspended person has no session, so this is how they use their
 * right to delete: proven the same way as signing in (or with its ticket). Works for an active account too (the same
 * thing the Workshop does).
 */
export async function closeFromSignIn(input: SignInProof, ctx: RequestContext): Promise<{ deleteOn: Date }> {
  const { row } = await proveAccount(input, ctx);
  const [u] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, row.id)).limit(1);
  return closeAccount(row.id, u!.email, ctx);
}

const INVALID_TICKET_MESSAGE = 'That took too long. Sign in again.';

/** Password (+ the second step when it is on), or a still-valid ticket. Returns the account whatever its status. */
async function proveAccount(
  input: SignInProof,
  ctx: RequestContext,
): Promise<{ row: ProvenAccount; method: string }> {
  if ('ticket' in input) {
    await enforceRateLimit(`auth:token:ip:${ctx.ip}`, RATE.tokenIp);
    const userId = readTicket(input.ticket);
    const [row] = userId
      ? await getDb()
          .select({
            id: users.id,
            handle: users.handle,
            status: users.status,
            emailVerifiedAt: users.emailVerifiedAt,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
      : [];
    if (!row) throw new AppError('UNAUTHENTICATED', { message: INVALID_TICKET_MESSAGE });
    return { row, method: 'ticket' };
  }
  if ('googleUserId' in input) {
    const [row] = await getDb()
      .select({
        id: users.id,
        handle: users.handle,
        status: users.status,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, input.googleUserId))
      .limit(1);
    if (!row) throw new AppError('UNAUTHENTICATED', { message: INVALID_TICKET_MESSAGE });
    const step = await requireSecondStep(row.id, input.code, ctx);
    return { row, method: step === 'password' ? 'google' : `google+${step}` };
  }
  const row = await verifyCredentials(input, ctx);
  const method = await requireSecondStep(row.id, input.code, ctx);
  return { row, method };
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
