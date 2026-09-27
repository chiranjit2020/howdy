import { townHallMembers, townHalls } from '@db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getCards, resolveHandle, type PersonCard } from '@/modules/profiles';
import { decodeCursor, encodeCursor, type Cursor } from '@/platform/cursor';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import {
  MEMBER_MAX_PAGE_SIZE,
  MEMBER_PAGE_SIZE,
  TOWNHALL_MAX_PAGE_SIZE,
  TOWNHALL_PAGE_SIZE,
  townHallIdParamSchema,
  type TownHallAction,
  type TownHallVisibility,
} from '@/shared/validation/town-halls';
import type { PortraitTint } from '@/shared/validation/profile';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });

/** Every limit fails closed. Creating one is the rarer, weightier action; reading matches the Fence. */
export const RATE = {
  read: rule(240, 60),
  create: rule(5, 86_400),
  act: rule(60, 3600),
  invite: rule(30, 3600),
  // Stricter than the per-person budget on purpose: an owner of several Town Halls could otherwise spend their whole
  // per-person budget concentrated on just one of them.
  invitePerHall: rule(20, 3600),
  manage: rule(120, 3600),
} as const;

const MAX_ROUNDS = 4;
const MINE_LIMIT = 200;
const INVITES_LIMIT = 50;

export interface MemberRef {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  role: 'owner' | 'member';
}

export interface TownHallSummary {
  id: string;
  name: string;
  description: string;
  visibility: TownHallVisibility;
  isOwner: boolean;
}

export interface DirectoryItem extends TownHallSummary {
  /** Am I already an active member (so "Join" should read "Open" instead)? */
  joined: boolean;
}

export interface DirectoryPage {
  townHalls: DirectoryItem[];
  nextCursor: string | null;
}

export interface TownHallDetail extends TownHallSummary {
  membership: 'none' | 'active' | 'invited';
  /** May the viewer join with one tap right now? */
  canJoin: boolean;
}

export interface InviteSummary {
  townHallId: string;
  name: string;
  description: string;
  invitedBy: MemberRef;
}

export interface MemberPage {
  members: MemberRef[];
  nextCursor: string | null;
}

interface Row {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  visibility: string;
  createdAt: Date;
}

const toSummary = (row: Row, viewerId: string): TownHallSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  visibility: row.visibility as TownHallVisibility,
  isOwner: row.ownerId === viewerId,
});

/** My membership row for one Town Hall, or null if I have none at all. */
async function myMembership(
  userId: string,
  townHallId: string,
): Promise<{ role: string; status: string } | null> {
  const [row] = await getDb()
    .select({ role: townHallMembers.role, status: townHallMembers.status })
    .from(townHallMembers)
    .where(and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Create a Town Hall. The creator becomes its owner in the same transaction — a Town Hall never exists without one. */
export async function createTownHall(
  ownerId: string,
  input: { name: string; description: string; visibility: TownHallVisibility },
): Promise<TownHallDetail> {
  await enforceRateLimit(`townhalls:create:${ownerId}`, RATE.create);
  const row = await getDb().transaction(async (tx) => {
    const [made] = await tx
      .insert(townHalls)
      .values({ ownerId, ...input, createdAt: new Date() })
      .returning();
    await tx
      .insert(townHallMembers)
      .values({ townHallId: made!.id, userId: ownerId, role: 'owner', status: 'active' });
    return made!;
  });
  return { ...toSummary(row, ownerId), membership: 'active', canJoin: false };
}

/** One page of the directory: open and members-visibility Town Halls, newest first. Invite-only ones never appear here. */
export async function listDirectory(
  viewerId: string,
  opts: { cursor?: string | undefined; limit?: number | undefined },
): Promise<DirectoryPage> {
  let cursor: Cursor | null = null;
  if (opts.cursor !== undefined) {
    cursor = decodeCursor(opts.cursor);
    if (!cursor) throw new AppError('BAD_REQUEST', { message: 'That page marker is not valid.' });
  }
  await enforceRateLimit(`townhalls:read:${viewerId}`, RATE.read);
  const limit = Math.min(Math.max(opts.limit ?? TOWNHALL_PAGE_SIZE, 1), TOWNHALL_MAX_PAGE_SIZE);

  const rows: Row[] = await getDb()
    .select()
    .from(townHalls)
    .where(
      and(
        inArray(townHalls.visibility, ['open', 'members']),
        cursor ? sql`(${townHalls.createdAt}, ${townHalls.id}) < (${cursor.at}, ${cursor.id})` : undefined,
      ),
    )
    .orderBy(desc(townHalls.createdAt), desc(townHalls.id))
    .limit(limit + 1);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);

  const memberships = page.length
    ? await getDb()
        .select({ townHallId: townHallMembers.townHallId })
        .from(townHallMembers)
        .where(
          and(
            eq(townHallMembers.userId, viewerId),
            eq(townHallMembers.status, 'active'),
            inArray(
              townHallMembers.townHallId,
              page.map((r) => r.id),
            ),
          ),
        )
    : [];
  const joined = new Set(memberships.map((m) => m.townHallId));

  const last = page.at(-1);
  return {
    townHalls: page.map((row) => ({ ...toSummary(row, viewerId), joined: joined.has(row.id) })),
    nextCursor: more && last ? encodeCursor({ at: last.createdAt, id: last.id }) : null,
  };
}

/** Every Town Hall I currently belong to (owner or member), whatever its visibility. Not paginated: this is mine. */
export async function listMine(viewerId: string): Promise<TownHallSummary[]> {
  await enforceRateLimit(`townhalls:read:${viewerId}`, RATE.read);
  const rows = await getDb()
    .select({
      id: townHalls.id,
      ownerId: townHalls.ownerId,
      name: townHalls.name,
      description: townHalls.description,
      visibility: townHalls.visibility,
      createdAt: townHalls.createdAt,
    })
    .from(townHallMembers)
    .innerJoin(townHalls, eq(townHalls.id, townHallMembers.townHallId))
    .where(and(eq(townHallMembers.userId, viewerId), eq(townHallMembers.status, 'active')))
    .orderBy(desc(townHalls.createdAt))
    .limit(MINE_LIMIT);
  return rows.map((row) => toSummary(row, viewerId));
}

/** Town Halls that invited me and are still waiting for my answer. */
export async function listMyInvites(viewerId: string): Promise<InviteSummary[]> {
  await enforceRateLimit(`townhalls:read:${viewerId}`, RATE.read);
  const rows = await getDb()
    .select({
      townHallId: townHalls.id,
      name: townHalls.name,
      description: townHalls.description,
      ownerId: townHalls.ownerId,
    })
    .from(townHallMembers)
    .innerJoin(townHalls, eq(townHalls.id, townHallMembers.townHallId))
    .where(and(eq(townHallMembers.userId, viewerId), eq(townHallMembers.status, 'invited')))
    .orderBy(desc(townHallMembers.createdAt))
    .limit(INVITES_LIMIT);
  const owners = await getCards(rows.map((r) => r.ownerId));
  return rows.flatMap((r) => {
    const owner = owners.get(r.ownerId);
    if (!owner) return [];
    return [
      {
        townHallId: r.townHallId,
        name: r.name,
        description: r.description,
        invitedBy: { ...toRef(owner), role: 'owner' as const },
      },
    ];
  });
}

/** How many invites are waiting for me, for the shell's nav badge. Best-effort, so no rate limit (called on every page). */
export async function countMyInvites(viewerId: string): Promise<number> {
  const [{ n } = { n: 0 }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(townHallMembers)
    .where(and(eq(townHallMembers.userId, viewerId), eq(townHallMembers.status, 'invited')));
  return n;
}

const toRef = (p: PersonCard): Omit<MemberRef, 'role'> => ({
  handle: p.handle,
  displayName: p.displayName,
  portraitTint: p.portraitTint,
});

/**
 * One Town Hall, or null when the viewer may not know it exists: `invite` visibility is hidden from everyone without a
 * membership row (active or still-pending). `open`/`members` are visible to any active viewer.
 */
/**
 * Would `getTownHall` show this Town Hall to this person? The page's gate, run in its layout before the loading
 * outline streams, so an invite-only Town Hall they are not in (or a made-up id) is a real 404. Its own budget.
 */
export async function mayOpenTownHall(viewerId: string, townHallId: string): Promise<boolean> {
  await enforceRateLimit(`townhalls:check:${viewerId}`, RATE.read);
  if (!townHallIdParamSchema.safeParse(townHallId).success) return false;
  const [row] = await getDb()
    .select({ visibility: townHalls.visibility })
    .from(townHalls)
    .where(eq(townHalls.id, townHallId))
    .limit(1);
  if (!row) return false;
  return row.visibility !== 'invite' || (await myMembership(viewerId, townHallId)) !== null;
}

export async function getTownHall(viewerId: string, townHallId: string): Promise<TownHallDetail | null> {
  await enforceRateLimit(`townhalls:read:${viewerId}`, RATE.read);
  const [row] = await getDb().select().from(townHalls).where(eq(townHalls.id, townHallId)).limit(1);
  if (!row) return null;
  const mine = await myMembership(viewerId, townHallId);
  if (row.visibility === 'invite' && !mine) return null;

  const membership: TownHallDetail['membership'] =
    mine?.status === 'active' ? 'active' : mine?.status === 'invited' ? 'invited' : 'none';
  return {
    ...toSummary(row, viewerId),
    membership,
    canJoin: membership === 'none' && row.visibility !== 'invite',
  };
}

/** A Town Hall's roster, paginated. Active members only (owner included) — nobody else may read it. */
export async function listMembers(
  viewerId: string,
  townHallId: string,
  opts: { cursor?: string | undefined; limit?: number | undefined },
): Promise<MemberPage | null> {
  let cursor: Cursor | null = null;
  if (opts.cursor !== undefined) {
    cursor = decodeCursor(opts.cursor);
    if (!cursor) throw new AppError('BAD_REQUEST', { message: 'That page marker is not valid.' });
  }
  await enforceRateLimit(`townhalls:read:${viewerId}`, RATE.read);
  const mine = await myMembership(viewerId, townHallId);
  if (!mine || mine.status !== 'active') return null;
  const limit = Math.min(Math.max(opts.limit ?? MEMBER_PAGE_SIZE, 1), MEMBER_MAX_PAGE_SIZE);

  const kept: { userId: string; role: string }[] = [];
  let next: Cursor | null = null;
  let position = cursor;
  for (let round = 0; round < MAX_ROUNDS && kept.length < limit; round++) {
    const rows = await getDb()
      .select({
        userId: townHallMembers.userId,
        role: townHallMembers.role,
        createdAt: townHallMembers.createdAt,
      })
      .from(townHallMembers)
      .where(
        and(
          eq(townHallMembers.townHallId, townHallId),
          eq(townHallMembers.status, 'active'),
          position
            ? sql`(${townHallMembers.createdAt}, ${townHallMembers.userId}) < (${position.at}, ${position.id})`
            : undefined,
        ),
      )
      .orderBy(desc(townHallMembers.createdAt), desc(townHallMembers.userId))
      .limit(limit + 1);
    const more = rows.length > limit;
    const page = rows.slice(0, limit);
    const cards = await getCards(page.map((r) => r.userId));
    for (const r of page) {
      if (cards.has(r.userId)) kept.push({ userId: r.userId, role: r.role });
      if (kept.length === limit) break;
    }
    const last = page.at(-1);
    position = last ? { at: last.createdAt, id: last.userId } : position;
    if (!more) {
      next = null;
      break;
    }
    next = position;
  }
  const cards = await getCards(kept.map((k) => k.userId));
  return {
    members: kept.flatMap((k) => {
      const card = cards.get(k.userId);
      return card ? [{ ...toRef(card), role: k.role as 'owner' | 'member' }] : [];
    }),
    nextCursor: next ? encodeCursor(next) : null,
  };
}

/** Join, leave, accept an invite, or decline one. Every action is idempotent where that makes sense for it. */
export async function act(
  userId: string,
  townHallId: string,
  action: TownHallAction,
): Promise<TownHallDetail> {
  await enforceRateLimit(`townhalls:act:${userId}`, RATE.act);
  const [row] = await getDb().select().from(townHalls).where(eq(townHalls.id, townHallId)).limit(1);
  if (!row) throw new AppError('NOT_FOUND');
  const db = getDb();

  switch (action) {
    case 'join': {
      if (row.visibility === 'invite') throw new AppError('NOT_FOUND');
      await db
        .insert(townHallMembers)
        .values({ townHallId, userId, role: 'member', status: 'active' })
        .onConflictDoNothing();
      break;
    }
    case 'leave': {
      if (row.ownerId === userId) {
        throw new AppError('BAD_REQUEST', {
          message: 'The owner cannot leave — delete the Town Hall instead.',
        });
      }
      await db
        .delete(townHallMembers)
        .where(and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, userId)));
      break;
    }
    case 'accept': {
      const mine = await myMembership(userId, townHallId);
      if (!mine || mine.status !== 'invited') throw new AppError('NOT_FOUND');
      await db
        .update(townHallMembers)
        .set({ status: 'active' })
        .where(and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, userId)));
      emit({ type: 'townhall.invite_accepted', townHallId, ownerId: row.ownerId, inviteeId: userId });
      break;
    }
    case 'decline': {
      const mine = await myMembership(userId, townHallId);
      if (!mine || mine.status !== 'invited') throw new AppError('NOT_FOUND');
      await db
        .delete(townHallMembers)
        .where(and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, userId)));
      break;
    }
  }

  // Built from what we already know, not re-read through getTownHall: leaving/declining an `invite`-only Town Hall
  // removes the only membership row that made it visible, so a re-read would (correctly) 404 on the very thing the
  // caller just did.
  const membership: TownHallDetail['membership'] =
    action === 'join' || action === 'accept' ? 'active' : 'none';
  return {
    ...toSummary(row, userId),
    membership,
    canJoin: membership === 'none' && row.visibility !== 'invite',
  };
}

/** Invite someone by call sign. Owner only. A repeat invite (already invited, or already a member) is a harmless no-op. */
export async function invite(ownerId: string, townHallId: string, handle: string): Promise<void> {
  await enforceRateLimit(`townhalls:invite:${ownerId}`, RATE.invite);
  const [row] = await getDb()
    .select()
    .from(townHalls)
    .where(and(eq(townHalls.id, townHallId), eq(townHalls.ownerId, ownerId)))
    .limit(1);
  if (!row) throw new AppError('NOT_FOUND');
  await enforceRateLimit(`townhalls:invite:${townHallId}`, RATE.invitePerHall);
  const target = await resolveHandle(handle);
  if (!target) throw new AppError('NOT_FOUND', { message: 'No one has that call sign.' });
  if (target.userId === ownerId) throw new AppError('BAD_REQUEST', { message: 'You already own it.' });

  const made = await getDb()
    .insert(townHallMembers)
    .values({ townHallId, userId: target.userId, role: 'member', status: 'invited' })
    .onConflictDoNothing()
    .returning({ userId: townHallMembers.userId });
  if (made.length > 0) {
    emit({ type: 'townhall.invited', townHallId, ownerId, inviteeId: target.userId });
  }
}

/** Remove a member by call sign (or revoke a still-pending invite). Owner only; cannot remove themself this way. */
export async function removeMember(ownerId: string, townHallId: string, targetHandle: string): Promise<void> {
  await enforceRateLimit(`townhalls:manage:${ownerId}`, RATE.manage);
  const [row] = await getDb()
    .select({ id: townHalls.id })
    .from(townHalls)
    .where(and(eq(townHalls.id, townHallId), eq(townHalls.ownerId, ownerId)))
    .limit(1);
  if (!row) throw new AppError('NOT_FOUND');
  const target = await resolveHandle(targetHandle);
  if (!target) throw new AppError('NOT_FOUND');
  if (target.userId === ownerId)
    throw new AppError('BAD_REQUEST', { message: 'Delete the Town Hall instead.' });
  await getDb()
    .delete(townHallMembers)
    .where(and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, target.userId)));
}

/** Change name, description and/or visibility. Owner only. */
export async function updateTownHall(
  ownerId: string,
  townHallId: string,
  patch: { name?: string; description?: string; visibility?: TownHallVisibility },
): Promise<TownHallDetail> {
  await enforceRateLimit(`townhalls:manage:${ownerId}`, RATE.manage);
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  const [row] = await getDb()
    .update(townHalls)
    .set(set)
    .where(and(eq(townHalls.id, townHallId), eq(townHalls.ownerId, ownerId)))
    .returning();
  if (!row) throw new AppError('NOT_FOUND');
  return { ...toSummary(row, ownerId), membership: 'active', canJoin: false };
}

/** Delete a Town Hall and every membership row in it (cascade). Owner only. */
export async function deleteTownHall(ownerId: string, townHallId: string): Promise<void> {
  await enforceRateLimit(`townhalls:manage:${ownerId}`, RATE.manage);
  const rows = await getDb()
    .delete(townHalls)
    .where(and(eq(townHalls.id, townHallId), eq(townHalls.ownerId, ownerId)))
    .returning({ id: townHalls.id });
  if (rows.length === 0) throw new AppError('NOT_FOUND');
}
