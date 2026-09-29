import { credentials, retiredHandles, users } from '@db/schema';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { hasLiveSuspension } from '@/modules/moderation';
import { runAfterResponse } from '@/platform/background';
import { getEnv } from '@/platform/config/env';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { logger } from '@/platform/logger';
import { getMailer } from '@/platform/mailer';
import { enforceRateLimit } from '@/platform/rate-limit';
import { audit } from './audit';
import { RATE } from './config';
import { handleDigest, verifyPassword } from './crypto';
import { accountDeletedMessage, deletionScheduledMessage } from './emails';
import { revokeAllSessions } from './sessions';

/**
 * Account deletion, "Burn the Deed" (ADR-027; design in docs/DATA_LIFECYCLE.md §2). Three steps:
 *  1. the owner asks (password re-checked): the account is closed at once — every session ends, and it is hidden
 *     everywhere, because every gate admits only `active` accounts;
 *  2. a grace period: signing in offers "Keep my account", which puts it back exactly as it was;
 *  3. after the grace period, a daily job deletes it for good (the app layer removes the photo files first).
 */

/** How long a closed account can still be kept by signing in. */
export const DELETION_GRACE_DAYS = 14;
/** How long a deleted account's call sign is held back from anyone else. */
export const HANDLE_HOLD_DAYS = 90;
const DAY_MS = 86_400_000;

export const deleteOnFor = (requestedAt: Date): Date =>
  new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * DAY_MS);

const log = logger.child({ module: 'auth.deletion' });

/**
 * Close my account and schedule its deletion. The password is asked for again: a session left open on a shared device
 * must not be enough to erase someone. Works for an active or a suspended account (deletion is a privacy right; the
 * reports about a suspended one stay, with the link removed, for their usual time). Ends every session.
 */
export async function requestDeletion(
  userId: string,
  password: string,
  ctx: { requestId: string },
): Promise<{ deleteOn: Date }> {
  await enforceRateLimit(`auth:delete:${userId}`, RATE.deleteAccount);
  const [row] = await getDb()
    .select({ email: users.email, status: users.status, passwordHash: credentials.passwordHash })
    .from(users)
    .innerJoin(credentials, eq(credentials.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row || !(await verifyPassword(row.passwordHash, password))) {
    throw new AppError('BAD_REQUEST', {
      message: 'That password is not right.',
      fields: { password: 'That password is not right.' },
    });
  }
  return closeAccount(userId, row.email, ctx);
}

/**
 * Close the account and schedule its deletion, for a caller that has ALREADY verified the password: the Workshop (with
 * a session, above) or the sign-in page (a suspended person has no session — `closeFromSignIn` in accounts.ts).
 */
export async function closeAccount(
  userId: string,
  email: string,
  ctx: { requestId: string },
): Promise<{ deleteOn: Date }> {
  const now = new Date();
  const changed = await getDb()
    .update(users)
    .set({ status: 'pending_deletion', deletionRequestedAt: now })
    .where(and(eq(users.id, userId), inArray(users.status, ['active', 'suspended'])))
    .returning({ id: users.id });
  if (changed.length === 0) throw new AppError('CONFLICT', { message: 'This account is already closing.' });
  await revokeAllSessions(userId);
  await audit('deletion_requested', { userId, requestId: ctx.requestId });
  const deleteOn = deleteOnFor(now);
  runAfterResponse('mail.deletion_scheduled', () =>
    getMailer().send(deletionScheduledMessage(email, deleteOn)),
  );
  return { deleteOn };
}

/** When a closing account will be deleted, for the sign-in page (only ever shown after the password was proven). */
export async function deletionDate(userId: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ at: users.deletionRequestedAt })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.status, 'pending_deletion')))
    .limit(1);
  return row?.at ? deleteOnFor(row.at) : null;
}

/**
 * "Keep my account": cancel a scheduled deletion, for a caller that has ALREADY verified the password. The account goes
 * back exactly as it was — suspended if a suspension is still in force, active otherwise — so closing and reopening can
 * never be used to get out of a suspension. Allowed until the account is actually deleted.
 */
export async function keepAccount(userId: string, ctx: { requestId: string }): Promise<void> {
  const back = (await hasLiveSuspension(userId)) ? 'suspended' : 'active';
  const rows = await getDb()
    .update(users)
    .set({ status: back, deletionRequestedAt: null })
    .where(and(eq(users.id, userId), eq(users.status, 'pending_deletion')))
    .returning({ id: users.id });
  if (rows.length === 0) throw new AppError('BAD_REQUEST', { message: 'This account is not closing.' });
  await audit('deletion_cancelled', { userId, requestId: ctx.requestId });
}

/** Accounts whose grace period is over, oldest first. The daily job deletes these. */
export async function dueDeletions(now: Date = new Date(), limit = 100): Promise<string[]> {
  const rows = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.status, 'pending_deletion'),
        lte(users.deletionRequestedAt, new Date(now.getTime() - DELETION_GRACE_DAYS * DAY_MS)),
      ),
    )
    .orderBy(users.deletionRequestedAt)
    .limit(limit);
  return rows.map((r) => r.id);
}

/**
 * Delete one closed account for good. The caller (the app layer) must have removed the person's files from storage
 * first — the database cannot, and a `media` row left behind is how a failed file delete gets retried. Deleting the
 * `users` row cascades everything they own (docs/DATA_LIFECYCLE.md §1); the audit log and reports keep their rows with
 * the link cleared. The call sign is held back (as a keyed hash) for 90 days. Only an account that is still closing is
 * touched; returns whether it was deleted.
 */
export async function eraseAccount(userId: string): Promise<boolean> {
  const erased = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ handle: users.handle, email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.status, 'pending_deletion')))
      .for('update')
      .limit(1);
    if (!row) return null;
    const availableAt = new Date(Date.now() + HANDLE_HOLD_DAYS * DAY_MS);
    await tx
      .insert(retiredHandles)
      .values({ handleDigest: handleDigest(getEnv().AUTH_SECRET, row.handle), availableAt })
      .onConflictDoUpdate({ target: retiredHandles.handleDigest, set: { availableAt } });
    await tx.delete(users).where(eq(users.id, userId));
    return row;
  });
  if (!erased) return false;
  // No user id: the account is gone, and the row would only have its link cleared anyway.
  await audit('account_deleted', {});
  log.info({ event: 'auth.account_deleted' });
  try {
    await getMailer().send(accountDeletedMessage(erased.email));
  } catch (cause) {
    log.warn({ event: 'auth.account_deleted_mail_failed', cause: String(cause) });
  }
  return true;
}

/** Is this call sign held back from a deleted account? Sign-up answers exactly as for a taken one. */
export async function isHandleHeld(handle: string, now: Date = new Date()): Promise<boolean> {
  const [row] = await getDb()
    .select({ at: retiredHandles.availableAt })
    .from(retiredHandles)
    .where(eq(retiredHandles.handleDigest, handleDigest(getEnv().AUTH_SECRET, handle)))
    .limit(1);
  return row !== undefined && row.at > now;
}

/** Retention: forget held-back call signs once they are free again. */
export async function purgeFreedHandles(now: Date = new Date()): Promise<{ handlesFreed: number }> {
  const rows = await getDb()
    .delete(retiredHandles)
    .where(lte(retiredHandles.availableAt, now))
    .returning({ d: retiredHandles.handleDigest });
  return { handlesFreed: rows.length };
}
