import { timeCapsules } from '@db/schema';
import { and, asc, count, desc, eq, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { enforceNewAccountLimit } from '@/modules/moderation';
import { getCards, resolveHandle, type PersonCard } from '@/modules/profiles';
import { hiddenAuthors, posseMembersAmong } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import { addDays, addYears, dayOf } from '@/shared/calendar';
import { CAPSULE_MAX_YEARS, type SealCapsuleInput } from '@/shared/validation/capsules';
import { idParamSchema } from '@/shared/validation/fence';
import type { PortraitTint } from '@/shared/validation/profile';

/**
 * Time Capsules (Phase 12, ADR-028): words sealed until a day, to my future self or to one Pal.
 * - Sealed words are returned to NOBODY, the writer included: every read below selects `body` only for opened rows.
 * - A capsule opens on its day only if its writer and recipient are both active and (for a Pal) still Pals with no block;
 *   if they are not Pals any more, it is deleted, words and all. If someone is suspended it simply waits.
 * - It opens the first time its recipient looks on or after the day, or in the daily job, whichever comes first.
 */

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
export const RATE = {
  seal: rule(10, 86_400),
  read: rule(240, 60),
  manage: rule(60, 3600),
} as const;
/** Unopened capsules one person may have out at once, and to any one Pal. */
export const MAX_SEALED = 20;
export const MAX_SEALED_PER_PAL = 3;

/** `portraitUrl` is filled in by the app layer only when the viewer may see it. */
type Person = { handle: string; displayName: string; portraitTint: PortraitTint; portraitUrl?: string };
const personOf = (c: PersonCard): Person => ({
  handle: c.handle,
  displayName: c.displayName,
  portraitTint: c.portraitTint,
});

// ─── sealing ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Seal a capsule. The limits are spent before the call sign is looked up, so running out says nothing about who exists.
 * A call sign that is not one of my Pals (made up, a stranger, a block) is the same 404.
 */
export async function sealCapsule(
  authorId: string,
  input: SealCapsuleInput,
  now: Date = new Date(),
): Promise<{ id: string; openOn: string }> {
  await enforceRateLimit(`capsule:seal:${authorId}`, RATE.seal);
  await enforceNewAccountLimit(authorId, 'capsule');
  const today = dayOf(now);
  const earliest = addDays(today, 1);
  const latest = addYears(today, CAPSULE_MAX_YEARS);
  if (input.openOn < earliest || input.openOn > latest) {
    throw new AppError('VALIDATION_FAILED', {
      fields: { openOn: `Pick a day between tomorrow and ${CAPSULE_MAX_YEARS} years from now.` },
    });
  }

  let recipientId = authorId;
  if (input.to !== 'me') {
    const other = await resolveHandle(input.to);
    if (
      !other ||
      other.userId === authorId ||
      !(await posseMembersAmong(authorId, [other.userId])).has(other.userId)
    ) {
      throw new AppError('NOT_FOUND', {
        message: 'You can seal a Time Capsule for yourself or one of your Pals.',
      });
    }
    recipientId = other.userId;
  }

  const db = getDb();
  const sealed = and(eq(timeCapsules.authorId, authorId), isNull(timeCapsules.openedAt));
  const [[mine], [toThem]] = await Promise.all([
    db.select({ n: count() }).from(timeCapsules).where(sealed),
    db
      .select({ n: count() })
      .from(timeCapsules)
      .where(and(sealed, eq(timeCapsules.recipientId, recipientId))),
  ]);
  if ((mine?.n ?? 0) >= MAX_SEALED) {
    throw new AppError('CONFLICT', { message: `You have ${MAX_SEALED} capsules waiting already.` });
  }
  if (recipientId !== authorId && (toThem?.n ?? 0) >= MAX_SEALED_PER_PAL) {
    throw new AppError('CONFLICT', {
      message: `You have ${MAX_SEALED_PER_PAL} capsules waiting for them already.`,
    });
  }
  const [row] = await db
    .insert(timeCapsules)
    .values({ authorId, recipientId, body: input.body, openOn: input.openOn, createdAt: now })
    .returning({ id: timeCapsules.id, openOn: timeCapsules.openOn });
  return row!;
}

/**
 * Remove a capsule: one I sealed that has not opened yet (taking it back), or one that opened for me (it is mine now).
 * Nothing else — not someone else's, not one sealed for me — so everything else is the same 404.
 */
export async function removeCapsule(userId: string, capsuleId: string): Promise<void> {
  await enforceRateLimit(`capsule:manage:${userId}`, RATE.manage);
  if (!idParamSchema.safeParse(capsuleId).success) throw new AppError('NOT_FOUND');
  const gone = await getDb()
    .delete(timeCapsules)
    .where(
      and(
        eq(timeCapsules.id, capsuleId),
        or(
          and(eq(timeCapsules.authorId, userId), isNull(timeCapsules.openedAt)),
          and(eq(timeCapsules.recipientId, userId), isNotNull(timeCapsules.openedAt)),
        ),
      ),
    )
    .returning({ id: timeCapsules.id });
  if (gone.length === 0) throw new AppError('NOT_FOUND');
}

// ─── opening ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Open every capsule that is due (for one recipient, or everyone): its day has come in Howdy's calendar. Checked NOW,
 * not when it was sealed: both people must be active (a suspended one makes it wait), and a capsule to a Pal needs them
 * to still be Pals with no block — otherwise it is deleted, words and all. Returns how many opened and were dropped.
 */
export async function openDue(
  opts: { recipientId?: string; now?: Date; limit?: number } = {},
): Promise<{ capsulesOpened: number; capsulesDropped: number }> {
  const now = opts.now ?? new Date();
  const db = getDb();
  const due = await db
    .select({ id: timeCapsules.id, authorId: timeCapsules.authorId, recipientId: timeCapsules.recipientId })
    .from(timeCapsules)
    .where(
      and(
        isNull(timeCapsules.openedAt),
        lte(timeCapsules.openOn, dayOf(now)),
        opts.recipientId ? eq(timeCapsules.recipientId, opts.recipientId) : undefined,
      ),
    )
    .orderBy(asc(timeCapsules.openOn))
    .limit(opts.limit ?? 500);
  let opened = 0;
  let dropped = 0;
  for (const c of due) {
    const active = await getCards([...new Set([c.authorId, c.recipientId])]);
    if (!active.has(c.authorId) || !active.has(c.recipientId)) continue; // suspended or leaving: it waits
    if (
      c.authorId !== c.recipientId &&
      !(await posseMembersAmong(c.authorId, [c.recipientId])).has(c.recipientId)
    ) {
      await db.delete(timeCapsules).where(and(eq(timeCapsules.id, c.id), isNull(timeCapsules.openedAt)));
      dropped += 1;
      continue;
    }
    const done = await db
      .update(timeCapsules)
      .set({ openedAt: now })
      .where(and(eq(timeCapsules.id, c.id), isNull(timeCapsules.openedAt)))
      .returning({ id: timeCapsules.id });
    if (done.length === 0) continue; // a racing reader opened it first
    opened += 1;
    emit({ type: 'capsule.opened', capsuleId: c.id, authorId: c.authorId, recipientId: c.recipientId });
  }
  return { capsulesOpened: opened, capsulesDropped: dropped };
}

// ─── reading ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface OpenedCapsule {
  id: string;
  /** Null when it is from my past self. */
  from: Person | null;
  body: string;
  sealedAt: string;
  openOn: string;
  openedAt: string;
}
export interface ComingCapsule {
  /** Null when it is from my past self. */
  from: Person | null;
  openOn: string;
}
export interface SealedCapsule {
  id: string;
  /** Null when it is for my future self. */
  to: Person | null;
  openOn: string;
  sealedAt: string;
}
export interface MyCapsules {
  opened: OpenedCapsule[];
  coming: ComingCapsule[];
  sealed: SealedCapsule[];
}

/**
 * Everything about capsules for me: opened ones (with their words), ones coming to me (who and when — never the words),
 * and the ones I sealed (to whom and when — never the words, not even mine). Anything due opens first. Capsules from
 * people I cannot see now (suspended, blocked, muted) are left out, as in every list.
 */
export async function myCapsules(userId: string, now: Date = new Date()): Promise<MyCapsules> {
  await enforceRateLimit(`capsule:read:${userId}`, RATE.read);
  await openDue({ recipientId: userId, now });
  const db = getDb();
  const [openedRows, comingRows, sealedRows] = await Promise.all([
    db
      .select({
        id: timeCapsules.id,
        authorId: timeCapsules.authorId,
        body: timeCapsules.body,
        createdAt: timeCapsules.createdAt,
        openOn: timeCapsules.openOn,
        openedAt: timeCapsules.openedAt,
      })
      .from(timeCapsules)
      .where(and(eq(timeCapsules.recipientId, userId), isNotNull(timeCapsules.openedAt)))
      .orderBy(desc(timeCapsules.openedAt))
      .limit(200),
    // Sealed and coming to me: NO body selected.
    db
      .select({ authorId: timeCapsules.authorId, openOn: timeCapsules.openOn })
      .from(timeCapsules)
      .where(and(eq(timeCapsules.recipientId, userId), isNull(timeCapsules.openedAt)))
      .orderBy(asc(timeCapsules.openOn))
      .limit(200),
    // Sealed by me: NO body selected.
    db
      .select({
        id: timeCapsules.id,
        recipientId: timeCapsules.recipientId,
        openOn: timeCapsules.openOn,
        createdAt: timeCapsules.createdAt,
      })
      .from(timeCapsules)
      .where(and(eq(timeCapsules.authorId, userId), isNull(timeCapsules.openedAt)))
      .orderBy(asc(timeCapsules.openOn))
      .limit(MAX_SEALED),
  ]);
  const others = [
    ...openedRows.map((r) => r.authorId),
    ...comingRows.map((r) => r.authorId),
    ...sealedRows.map((r) => r.recipientId),
  ].filter((id) => id !== userId);
  const [cards, hidden, pals] = await Promise.all([
    getCards([...new Set(others)]),
    hiddenAuthors(userId, others),
    posseMembersAmong(
      userId,
      comingRows.map((r) => r.authorId),
    ),
  ]);
  const visible = (id: string) => cards.has(id) && !hidden.has(id);
  return {
    opened: openedRows.flatMap((r): OpenedCapsule[] =>
      r.authorId !== userId && !visible(r.authorId)
        ? []
        : [
            {
              id: r.id,
              from: r.authorId === userId ? null : personOf(cards.get(r.authorId)!),
              body: r.body,
              sealedAt: r.createdAt.toISOString(),
              openOn: r.openOn,
              openedAt: r.openedAt!.toISOString(),
            },
          ],
    ),
    // "Coming" is only shown while it could still open: from me, or from someone who is still my Pal.
    coming: comingRows.flatMap((r): ComingCapsule[] =>
      r.authorId === userId
        ? [{ from: null, openOn: r.openOn }]
        : visible(r.authorId) && pals.has(r.authorId)
          ? [{ from: personOf(cards.get(r.authorId)!), openOn: r.openOn }]
          : [],
    ),
    sealed: sealedRows.flatMap((r): SealedCapsule[] =>
      r.recipientId === userId
        ? [{ id: r.id, to: null, openOn: r.openOn, sealedAt: r.createdAt.toISOString() }]
        : cards.has(r.recipientId)
          ? [
              {
                id: r.id,
                to: personOf(cards.get(r.recipientId)!),
                openOn: r.openOn,
                sealedAt: r.createdAt.toISOString(),
              },
            ]
          : [],
    ),
  };
}
