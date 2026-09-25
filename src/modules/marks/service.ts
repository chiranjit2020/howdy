import { marks } from '@db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { can, type Actor, type RanchResource } from '@/modules/authz';
import { getFenceResource, resolveHandle } from '@/modules/profiles';
import { fenceStanding } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import { MARK_KINDS, type MarkKind } from '@/shared/validation/marks';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });

/** Every limit fails closed. The 30-day cooldown per pair does the real work; these just stop abuse of the endpoint itself. */
export const RATE = {
  readUser: rule(240, 60),
  readAnonymous: rule(60, 60),
  give: rule(30, 3600),
} as const;

/** A rater may give one target only one Mark — any kind — this often. */
export const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

const actorOf = (userId: string): Actor => ({ kind: 'user', id: userId, status: 'active' });

async function access(
  viewer: Actor,
  ownerId: string,
): Promise<{ ranch: RanchResource; relationship: Awaited<ReturnType<typeof fenceStanding>> } | null> {
  const ranch = await getFenceResource(ownerId);
  if (!ranch) return null;
  const relationship =
    viewer.kind === 'user'
      ? await fenceStanding(ownerId, viewer.id)
      : { relationship: 'UNKNOWN' as const, restricted: false };
  return can(viewer, 'profile:view', ranch, { relationship: relationship.relationship }).allow
    ? { ranch, relationship }
    : null;
}

/** The most recent Mark `raterId` gave `targetId`, or null if there is none — the only thing the cooldown needs. */
async function lastGivenAt(raterId: string, targetId: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ createdAt: marks.createdAt })
    .from(marks)
    .where(and(eq(marks.raterId, raterId), eq(marks.targetId, targetId)))
    .orderBy(desc(marks.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

export interface VibeMatrix {
  /** Count per kind, always present even at zero. */
  counts: Record<MarkKind, number>;
  total: number;
  isOwner: boolean;
  /** May the viewer award a Mark right now (Posse gate AND not on cooldown)? */
  canGive: boolean;
  /** Set only when the viewer is blocked by the cooldown, not by the Posse gate. */
  cooldownEndsAt: Date | null;
}

const EMPTY_COUNTS = (): Record<MarkKind, number> =>
  Object.fromEntries(MARK_KINDS.map((k) => [k, 0])) as Record<MarkKind, number>;

/**
 * A Ranch's Vibe Matrix: how many Marks of each kind the owner has ever received, and nothing else — no names, no dates,
 * no per-Mark rows. Visible wherever the Ranch itself is (the same rule as a Tribute or the Fence). Giving one needs a
 * mutual Posse and to be off cooldown with this particular owner.
 */
export async function getVibeMatrix(
  viewer: Actor,
  handle: string,
  opts: { rateKey: string },
): Promise<VibeMatrix | null> {
  await enforceRateLimit(
    `marks:read:${opts.rateKey}`,
    viewer.kind === 'user' ? RATE.readUser : RATE.readAnonymous,
  );

  const owner = await resolveHandle(handle);
  if (!owner) return null;
  const ownerId = owner.userId;
  const acc = await access(viewer, ownerId);
  if (!acc) return null;

  const rows = await getDb()
    .select({ kind: marks.kind, n: sql<number>`count(*)::int` })
    .from(marks)
    .where(eq(marks.targetId, ownerId))
    .groupBy(marks.kind);
  const counts = EMPTY_COUNTS();
  let total = 0;
  for (const r of rows) {
    counts[r.kind as MarkKind] = r.n;
    total += r.n;
  }

  const viewerId = viewer.kind === 'user' ? viewer.id : null;
  const posseAllowed = can(viewer, 'mark:give', acc.ranch, {
    relationship: acc.relationship.relationship,
  }).allow;
  let cooldownEndsAt: Date | null = null;
  if (posseAllowed && viewerId) {
    const last = await lastGivenAt(viewerId, ownerId);
    if (last) {
      const ends = new Date(last.getTime() + COOLDOWN_MS);
      if (ends > new Date()) cooldownEndsAt = ends;
    }
  }

  return {
    counts,
    total,
    isOwner: viewerId === ownerId,
    canGive: posseAllowed && cooldownEndsAt === null,
    cooldownEndsAt,
  };
}

/**
 * Award a Mark to the person with call sign `handle`. Needs a mutual Posse (same gate as a Tribute) and to be off
 * cooldown with them — one Mark total per rater→target pair every 30 days, whichever kind. The kind is never announced
 * beyond the target: the Chime just says a Mark arrived, and the Ranch shows only the aggregate breakdown.
 */
export async function giveMark(raterId: string, handle: string, kind: MarkKind): Promise<{ kind: MarkKind }> {
  await enforceRateLimit(`marks:give:${raterId}`, RATE.give);
  const owner = await resolveHandle(handle);
  if (!owner) throw new AppError('NOT_FOUND');
  const targetId = owner.userId;
  const actor = actorOf(raterId);
  const acc = await access(actor, targetId);
  if (!acc) throw new AppError('NOT_FOUND');
  if (!can(actor, 'mark:give', acc.ranch, { relationship: acc.relationship.relationship }).allow) {
    throw new AppError('FORBIDDEN', { message: 'Only people in your Posse can Mark you.' });
  }
  // One statement, so two racing requests cannot both slip past the cooldown: the second sees the first's row.
  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  const inserted = await getDb().execute(sql`
    insert into marks (rater_id, target_id, kind, created_at)
    select ${raterId}, ${targetId}, ${kind}, ${new Date()}
    where not exists (
      select 1 from marks where rater_id = ${raterId} and target_id = ${targetId} and created_at > ${cutoff}
    )
    returning id`);
  if (inserted.rows.length === 0) {
    throw new AppError('CONFLICT', { message: 'You can Mark this person again once the cooldown is over.' });
  }
  emit({ type: 'mark.given', raterId, targetId });
  return { kind };
}
