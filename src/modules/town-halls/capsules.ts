import { townHallCapsules, townHallPosts } from '@db/schema';
import { and, asc, count, eq, lte } from 'drizzle-orm';
import { enforceNewAccountLimit, shouldHoldForOthers } from '@/modules/moderation';
import { getCards } from '@/modules/profiles';
import { hiddenAuthors } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import { addDays, addYears, dayOf } from '@/shared/calendar';
import { CAPSULE_MAX_YEARS } from '@/shared/validation/capsules';
import { idParamSchema } from '@/shared/validation/fence';
import type { PortraitTint } from '@/shared/validation/profile';
import { activeRole, isStaff, outranks } from './roles';

/**
 * Time Capsules for a whole Town Hall (ADR-043). The owner or a Deputy seals words until a day; on that day they become a
 * post in the feed, marked as a Time Capsule with the day they were sealed.
 * - Sealed words are returned to NOBODY, the writer included: nothing here selects `body` except the opening itself.
 * - Members see what is coming (who, and when); nobody else learns a capsule exists.
 * - It opens even if the writer has left or been banned since (the user's choice); a suspended writer makes it wait.
 *   The post is held for staff's OK, like any post, if the writer is no longer staff and is being reported a lot.
 * - It opens the first time a member looks at the feed on or after the day, or in the daily job, whichever comes first.
 */

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
export const HALL_CAPSULE_RATE = {
  seal: rule(10, 86_400),
  read: rule(240, 60),
  manage: rule(60, 3600),
} as const;
/** Unopened capsules one Town Hall may have waiting at once. */
export const MAX_HALL_CAPSULES = 10;

export interface HallCapsule {
  id: string;
  /** Null when the writer's account is not active now (it waits) or the viewer has hidden them. */
  from: { handle: string; displayName: string; portraitTint: PortraitTint; portraitUrl?: string } | null;
  openOn: string;
  sealedAt: string;
  /** The writer, or staff who outrank them, may take it back before it opens. */
  canTakeBack: boolean;
}

/**
 * Seal a capsule for a Town Hall. Its owner or a Deputy only; to everyone else the Town Hall is "not found", as with
 * every staff tool. The limits are spent first.
 */
export async function sealHallCapsule(
  userId: string,
  townHallId: string,
  input: { body: string; openOn: string },
  now: Date = new Date(),
): Promise<{ id: string; openOn: string }> {
  await enforceRateLimit(`townhalls:capsule:${userId}`, HALL_CAPSULE_RATE.seal);
  await enforceNewAccountLimit(userId, 'capsule');
  if (!idParamSchema.safeParse(townHallId).success) throw new AppError('NOT_FOUND');
  if (!isStaff(await activeRole(userId, townHallId))) throw new AppError('NOT_FOUND');
  const today = dayOf(now);
  if (input.openOn < addDays(today, 1) || input.openOn > addYears(today, CAPSULE_MAX_YEARS)) {
    throw new AppError('VALIDATION_FAILED', {
      fields: { openOn: `Pick a day between tomorrow and ${CAPSULE_MAX_YEARS} years from now.` },
    });
  }
  const [{ n } = { n: 0 }] = await getDb()
    .select({ n: count() })
    .from(townHallCapsules)
    .where(eq(townHallCapsules.townHallId, townHallId));
  if (n >= MAX_HALL_CAPSULES) {
    throw new AppError('CONFLICT', {
      message: `This Town Hall has ${MAX_HALL_CAPSULES} capsules waiting already.`,
    });
  }
  const [row] = await getDb()
    .insert(townHallCapsules)
    .values({ townHallId, authorId: userId, body: input.body, openOn: input.openOn, createdAt: now })
    .returning({ id: townHallCapsules.id, openOn: townHallCapsules.openOn });
  return row!;
}

/**
 * Take a capsule back before it opens (it is deleted, words and all): its writer may, even after leaving; so may staff
 * who outrank the writer here (the owner over a Deputy). Anything else is the same 404.
 */
export async function takeBackHallCapsule(
  userId: string,
  townHallId: string,
  capsuleId: string,
): Promise<void> {
  await enforceRateLimit(`townhalls:capsule-manage:${userId}`, HALL_CAPSULE_RATE.manage);
  if (!idParamSchema.safeParse(capsuleId).success || !idParamSchema.safeParse(townHallId).success) {
    throw new AppError('NOT_FOUND');
  }
  const [row] = await getDb()
    .select({ townHallId: townHallCapsules.townHallId, authorId: townHallCapsules.authorId })
    .from(townHallCapsules)
    .where(and(eq(townHallCapsules.id, capsuleId), eq(townHallCapsules.townHallId, townHallId)))
    .limit(1);
  if (!row) throw new AppError('NOT_FOUND');
  if (row.authorId !== userId) {
    const role = await activeRole(userId, row.townHallId);
    if (!isStaff(role) || !outranks(role, await activeRole(row.authorId, row.townHallId))) {
      throw new AppError('NOT_FOUND');
    }
  }
  await getDb().delete(townHallCapsules).where(eq(townHallCapsules.id, capsuleId));
}

/**
 * Open every capsule that is due (in one Town Hall, or everywhere): its day has come in Howdy's calendar. Each becomes a
 * post — written by its writer, dated now, marked with when it was sealed — and its capsule row is deleted in the same
 * transaction, so two openers at once make one post. A writer whose account is not active now makes it wait.
 */
export async function openHallCapsules(
  opts: { townHallId?: string; now?: Date; limit?: number } = {},
): Promise<{ hallCapsulesOpened: number }> {
  const now = opts.now ?? new Date();
  const due = await getDb()
    .select({
      id: townHallCapsules.id,
      townHallId: townHallCapsules.townHallId,
      authorId: townHallCapsules.authorId,
    })
    .from(townHallCapsules)
    .where(
      and(
        lte(townHallCapsules.openOn, dayOf(now)),
        opts.townHallId ? eq(townHallCapsules.townHallId, opts.townHallId) : undefined,
      ),
    )
    .orderBy(asc(townHallCapsules.openOn), asc(townHallCapsules.createdAt))
    .limit(opts.limit ?? 500);
  if (due.length === 0) return { hallCapsulesOpened: 0 };
  const active = await getCards([...new Set(due.map((c) => c.authorId))]);
  let opened = 0;
  for (const c of due) {
    if (!active.has(c.authorId)) continue; // suspended or leaving: it waits
    // Staff's words are never held (ADR-041); a writer who is no longer staff is treated like any member.
    const status =
      isStaff(await activeRole(c.authorId, c.townHallId)) || !(await shouldHoldForOthers(c.authorId))
        ? 'published'
        : 'held';
    const made = await getDb().transaction(async (tx) => {
      const [gone] = await tx
        .delete(townHallCapsules)
        .where(eq(townHallCapsules.id, c.id))
        .returning({ body: townHallCapsules.body, createdAt: townHallCapsules.createdAt });
      if (!gone) return false; // a racing opener (or a take-back) got there first
      await tx.insert(townHallPosts).values({
        townHallId: c.townHallId,
        authorId: c.authorId,
        body: gone.body,
        status,
        capsuleSealedAt: gone.createdAt,
        createdAt: new Date(),
      });
      return true;
    });
    if (made) opened += 1;
  }
  return { hallCapsulesOpened: opened };
}

/**
 * What is coming to this Town Hall — who sealed each capsule and when it opens, never the words. Active members only
 * (null for everyone else). Anything due opens first.
 */
export async function listHallCapsules(
  viewerId: string,
  townHallId: string,
  now: Date = new Date(),
): Promise<HallCapsule[] | null> {
  await enforceRateLimit(`townhalls:capsule-read:${viewerId}`, HALL_CAPSULE_RATE.read);
  if (!idParamSchema.safeParse(townHallId).success) return null;
  const role = await activeRole(viewerId, townHallId);
  if (!role) return null;
  await openHallCapsules({ townHallId, now });
  // NO body selected.
  const rows = await getDb()
    .select({
      id: townHallCapsules.id,
      authorId: townHallCapsules.authorId,
      openOn: townHallCapsules.openOn,
      createdAt: townHallCapsules.createdAt,
    })
    .from(townHallCapsules)
    .where(eq(townHallCapsules.townHallId, townHallId))
    .orderBy(asc(townHallCapsules.openOn), asc(townHallCapsules.createdAt))
    .limit(MAX_HALL_CAPSULES);
  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const [cards, hidden, roles] = await Promise.all([
    getCards(authorIds),
    hiddenAuthors(viewerId, authorIds),
    Promise.all(authorIds.map(async (id) => [id, await activeRole(id, townHallId)] as const)),
  ]);
  const roleOf = new Map(roles);
  return rows.map((r) => {
    const card = r.authorId === viewerId || !hidden.has(r.authorId) ? cards.get(r.authorId) : undefined;
    return {
      id: r.id,
      from: card
        ? { handle: card.handle, displayName: card.displayName, portraitTint: card.portraitTint }
        : null,
      openOn: r.openOn,
      sealedAt: r.createdAt.toISOString(),
      canTakeBack:
        r.authorId === viewerId || (isStaff(role) && outranks(role, roleOf.get(r.authorId) ?? null)),
    };
  });
}
