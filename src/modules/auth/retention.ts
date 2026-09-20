import { emailTokens, sessions } from '@db/schema';
import { and, isNotNull, lt, or } from 'drizzle-orm';
import { getDb } from '@/platform/db';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Dead sessions and spent tokens are kept briefly for debugging/support, then removed. Live ones are never touched. */
export const EXPIRED_GRACE_MS = 7 * DAY_MS;
export const SESSION_GRACE_MS = 30 * DAY_MS;

/**
 * Retention for authentication data (master prompt §54): remove email tokens that were used or expired more than a
 * week ago, and sessions that were revoked or expired more than 30 days ago. Idempotent; safe to run on a schedule.
 */
export async function purgeExpiredAuthData(
  now: Date = new Date(),
): Promise<{ emailTokens: number; sessions: number }> {
  const db = getDb();
  const tokenCutoff = new Date(now.getTime() - EXPIRED_GRACE_MS);
  const sessionCutoff = new Date(now.getTime() - SESSION_GRACE_MS);

  const tokens = await db
    .delete(emailTokens)
    .where(
      or(
        and(isNotNull(emailTokens.usedAt), lt(emailTokens.usedAt, tokenCutoff)),
        lt(emailTokens.expiresAt, tokenCutoff),
      ),
    )
    .returning({ id: emailTokens.id });

  const dead = await db
    .delete(sessions)
    .where(
      or(
        and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, sessionCutoff)),
        lt(sessions.absoluteExpiresAt, sessionCutoff),
        lt(sessions.idleExpiresAt, sessionCutoff),
      ),
    )
    .returning({ id: sessions.id });

  return { emailTokens: tokens.length, sessions: dead.length };
}
