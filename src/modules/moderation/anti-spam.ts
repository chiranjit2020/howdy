import { reports, users } from '@db/schema';
import { and, countDistinct, eq, gt } from 'drizzle-orm';
import { getDb } from '@/platform/db';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';

/**
 * Layered anti-spam controls (master prompt §32, ADR-024). None of them is a score and none of them punishes anyone:
 * each one only slows something down or asks a human (the Fence owner) to look first, and each lifts by itself.
 */

/** An account younger than this is "new" and gets the tighter budgets below. */
export const NEW_ACCOUNT_DAYS = 7;
const NEW_ACCOUNT_MS = NEW_ACCOUNT_DAYS * 86_400_000;

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
/**
 * Extra daily budgets for new accounts, spent ON TOP OF everyone's usual limits. Generous enough for a real person's
 * first week (joining, finding friends, saying hello) and far too small for a spam run.
 */
export const NEW_ACCOUNT_RATE = {
  card: rule(15, 86_400),
  reply: rule(40, 86_400),
  reaction: rule(150, 86_400),
  palRequest: rule(8, 86_400),
  whisper: rule(200, 86_400),
  townHallCreate: rule(1, 86_400),
  townHallInvite: rule(15, 86_400),
  capsule: rule(3, 86_400),
} as const;
export type NewAccountAction = keyof typeof NEW_ACCOUNT_RATE;

/**
 * How many different people must have open reports against someone (filed in the last week) before the cards and
 * replies they write on other people's Fences are held for the owner's OK. Reports that a moderator closes stop
 * counting at once, so the hold lifts by itself.
 */
export const AUTO_HOLD_REPORTERS = 3;
const AUTO_HOLD_WINDOW_MS = 7 * 86_400_000;

async function createdAt(userId: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.createdAt ?? null;
}

/** Is this account in its first week? */
export async function isNewAccount(userId: string): Promise<boolean> {
  const at = await createdAt(userId);
  return at !== null && Date.now() - at.getTime() < NEW_ACCOUNT_MS;
}

/**
 * Spend the new-account budget for `action` when the actor is in their first week; a no-op afterwards. Like every
 * per-person limit, callers spend it BEFORE looking anything up, so hitting it says nothing about the target.
 */
export async function enforceNewAccountLimit(userId: string, action: NewAccountAction): Promise<void> {
  if (!(await isNewAccount(userId))) return;
  await enforceRateLimit(`new:${action}:${userId}`, NEW_ACCOUNT_RATE[action]);
}

/** Open reports from at least `AUTO_HOLD_REPORTERS` different people in the last week. Decided at write time. */
export async function isUnderReview(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ n: countDistinct(reports.reporterId) })
    .from(reports)
    .where(
      and(
        eq(reports.targetUserId, userId),
        eq(reports.status, 'open'),
        gt(reports.createdAt, new Date(Date.now() - AUTO_HOLD_WINDOW_MS)),
      ),
    );
  return (row?.n ?? 0) >= AUTO_HOLD_REPORTERS;
}

/**
 * Should a card or reply that `authorId` writes on SOMEONE ELSE's Fence be held for the owner's OK? Yes when enough
 * different people have reported the author lately. `held` looks posted to its writer (ADR-011), so this is invisible
 * to them and says nothing about who reported them. (Links need no check here: public text refuses them outright.)
 */
export async function shouldHoldForOthers(authorId: string): Promise<boolean> {
  return isUnderReview(authorId);
}
