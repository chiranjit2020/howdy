import { marks } from '@db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { can, inPosse, type Actor, type RanchResource } from '@/modules/authz';
import { getFenceResource, resolveHandle } from '@/modules/profiles';
import { fenceStanding } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import { MARK_KINDS, type MarkKind } from '@/shared/validation/marks';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });

/** Every limit fails closed. One pick per pair does the real work; these just stop abuse of the endpoint itself. */
export const RATE = {
  readUser: rule(240, 60),
  readAnonymous: rule(60, 60),
  give: rule(30, 3600),
} as const;

const actorOf = (userId: string): Actor => ({ kind: 'user', id: userId, status: 'active' });

async function access(
  viewer: Actor,
  ownerId: string,
): Promise<{ ranch: RanchResource; relationship: Awaited<ReturnType<typeof fenceStanding>> } | null> {
  // Both at once (one round trip, not two): the standing needs only the owner's id.
  const [ranch, relationship] = await Promise.all([
    getFenceResource(ownerId),
    viewer.kind === 'user'
      ? fenceStanding(ownerId, viewer.id)
      : Promise.resolve({ relationship: 'UNKNOWN' as const, restricted: false }),
  ]);
  if (!ranch) return null;
  return can(viewer, 'profile:view', ranch, { relationship: relationship.relationship }).allow
    ? { ranch, relationship }
    : null;
}

/** How many different people must have picked before a profile shows any words (one person cannot label someone). */
export const MIN_DESCRIBERS = 3;
/** How many words a profile shows: the most-picked ones. */
export const TOP_WORDS = 2;

/** How a profile is described (ADR-052): words only, never counts, never who picked what. */
export interface Description {
  /** The most-picked words, most first (ties in catalogue order); empty until MIN_DESCRIBERS people have picked. */
  words: MarkKind[];
  isOwner: boolean;
  /** May the viewer pick a word for this person (a friend, not the owner)? */
  canGive: boolean;
  /** The viewer's own current pick for this person, if any. */
  mine: MarkKind | null;
}

/**
 * How a Ranch is described: its top words, visible wherever the Ranch itself is (the same rule as a Tribute or the
 * Fence), plus the viewer's own pick. The counts behind the words never leave the server.
 */
export async function getDescription(
  viewer: Actor,
  handle: string,
  opts: { rateKey: string },
): Promise<Description | null> {
  await enforceRateLimit(
    `marks:read:${opts.rateKey}`,
    viewer.kind === 'user' ? RATE.readUser : RATE.readAnonymous,
  );

  const owner = await resolveHandle(handle);
  if (!owner) return null;
  const ownerId = owner.userId;
  const acc = await access(viewer, ownerId);
  if (!acc) return null;

  const viewerId = viewer.kind === 'user' ? viewer.id : null;
  const canGive =
    viewerId !== ownerId &&
    can(viewer, 'mark:give', acc.ranch, { relationship: acc.relationship.relationship }).allow;
  const [rows, [own]] = await Promise.all([
    getDb()
      .select({ kind: marks.kind, n: sql<number>`count(*)::int` })
      .from(marks)
      .where(eq(marks.targetId, ownerId))
      .groupBy(marks.kind),
    viewerId
      ? getDb()
          .select({ kind: marks.kind })
          .from(marks)
          .where(and(eq(marks.raterId, viewerId), eq(marks.targetId, ownerId)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const counts = new Map<MarkKind, number>();
  let describers = 0;
  for (const r of rows) {
    if (!(MARK_KINDS as readonly string[]).includes(r.kind)) continue; // a retired kind outliving its migration
    counts.set(r.kind as MarkKind, r.n);
    describers += r.n; // one pick per person, so picks are people
  }
  const words =
    describers >= MIN_DESCRIBERS
      ? [...MARK_KINDS]
          .filter((k) => (counts.get(k) ?? 0) > 0)
          .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
          .slice(0, TOP_WORDS)
      : [];
  return {
    words,
    isOwner: viewerId === ownerId,
    canGive,
    mine: (own?.kind as MarkKind | undefined) ?? null,
  };
}

/**
 * Pick (or change) the one word that describes the person with call sign `handle`. Needs to be Pals (the same gate as
 * a Tribute; group neighbours could too until ADR-054). One current pick per pair, enforced by the database: picking again
 * replaces it. Only a first pick rings their bell, and it never says which word.
 */
export async function giveMark(raterId: string, handle: string, kind: MarkKind): Promise<{ kind: MarkKind }> {
  await enforceRateLimit(`marks:give:${raterId}`, RATE.give);
  const owner = await resolveHandle(handle);
  if (!owner) throw new AppError('NOT_FOUND');
  const targetId = owner.userId;
  const actor = actorOf(raterId);
  const acc = await access(actor, targetId);
  if (!acc) throw new AppError('NOT_FOUND');
  const relationship = acc.relationship.relationship;
  if (!can(actor, 'mark:give', acc.ranch, { relationship: relationship }).allow) {
    throw new AppError('FORBIDDEN', { message: 'Only friends can describe someone.' });
  }
  const fromPal = inPosse(relationship);
  // `xmax = 0` is true only for a row this statement inserted (not one it updated): a first pick.
  const result = await getDb().execute(sql`
    insert into marks (rater_id, target_id, kind, from_pal, created_at)
    values (${raterId}, ${targetId}, ${kind}, ${fromPal}, ${new Date()})
    on conflict (rater_id, target_id)
      do update set kind = excluded.kind, from_pal = excluded.from_pal, created_at = excluded.created_at
    returning (xmax = 0) as inserted`);
  if ((result.rows[0] as { inserted?: boolean } | undefined)?.inserted) {
    emit({ type: 'mark.given', raterId, targetId });
  }
  return { kind };
}

/** Take back your pick for this person. Always allowed (it is your own); a missing person or no pick is just false. */
export async function takeBackMark(raterId: string, handle: string): Promise<{ removed: boolean }> {
  await enforceRateLimit(`marks:give:${raterId}`, RATE.give);
  const owner = await resolveHandle(handle);
  if (!owner) return { removed: false };
  const gone = await getDb()
    .delete(marks)
    .where(and(eq(marks.raterId, raterId), eq(marks.targetId, owner.userId)))
    .returning({ id: marks.id });
  return { removed: gone.length > 0 };
}
