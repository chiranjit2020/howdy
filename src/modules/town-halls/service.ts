import { townHallBans, townHallMembers, townHalls } from '@db/schema';
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { enforceNewAccountLimit } from '@/modules/moderation';
import { getCards, resolveHandle, type PersonCard } from '@/modules/profiles';
import { hiddenAuthors } from '@/modules/relationships';
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
  type MemberAction,
  type TownHallAction,
  type TownHallJoinRule,
  type TownHallVisibility,
} from '@/shared/validation/town-halls';
import type { PortraitTint } from '@/shared/validation/profile';
import { activeRole, isStaff, outranks, type HallRole } from './roles';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });

/** Every limit fails closed. Creating one is the rarer, weightier action; reading matches the Fence. */
export const RATE = {
  read: rule(240, 60),
  create: rule(5, 86_400),
  act: rule(60, 3600),
  /** Asking to join rings every one of a Town Hall's staff: a few a day per person is plenty (ADR-041). */
  request: rule(10, 86_400),
  invite: rule(30, 3600),
  // Stricter than the per-person budget on purpose: an owner of several Town Halls could otherwise spend their whole
  // per-person budget concentrated on just one of them.
  invitePerHall: rule(20, 3600),
  manage: rule(120, 3600),
} as const;

/** A join request nobody answered — or that was quietly declined — runs out after this long (ADR-041). */
export const REQUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const MAX_ROUNDS = 4;
const MINE_LIMIT = 200;
const INVITES_LIMIT = 50;
const REQUESTS_LIMIT = 100;
const BANS_LIMIT = 200;

export interface MemberRef {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  /** Filled in by the app layer only when the viewer may see it. */
  portraitUrl?: string;
  role: HallRole;
}

export interface TownHallSummary {
  id: string;
  name: string;
  description: string;
  visibility: TownHallVisibility;
  joinRule: TownHallJoinRule;
  isOwner: boolean;
  /** My role while I am an active member; null otherwise. */
  myRole: HallRole | null;
}

export interface MineItem extends TownHallSummary {
  /** For the owner and Deputies: join requests waiting for an answer. Null for ordinary members. */
  requestsWaiting: number | null;
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
  membership: 'none' | 'active' | 'invited' | 'requested';
  /** May the viewer join with one tap right now? */
  canJoin: boolean;
  /** May the viewer ask to join (a Town Hall that needs approval)? */
  canAsk: boolean;
}

export interface InviteSummary {
  townHallId: string;
  name: string;
  description: string;
  invitedBy: MemberRef;
}

export interface JoinRequest {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  portraitUrl?: string;
  askedAt: Date;
}

export interface MemberPage {
  members: MemberRef[];
  nextCursor: string | null;
}

/** Someone banned from a Town Hall, as its staff see them (ADR-042). */
export interface BanEntry {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  portraitUrl?: string;
  bannedAt: Date;
  /** The call sign of whoever set it; null once their account is gone. */
  bannedBy: string | null;
}

/** The banned person's own side of a ban: only when they last "asked". */
interface Ban {
  askedAt: Date | null;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

interface Row {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  visibility: string;
  joinRule: string;
  createdAt: Date;
}

interface Mine {
  role: string;
  status: string;
  createdAt: Date;
}

const toSummary = (row: Row, viewerId: string, mine: Mine | null): TownHallSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  visibility: row.visibility as TownHallVisibility,
  joinRule: row.joinRule as TownHallJoinRule,
  isOwner: row.ownerId === viewerId,
  myRole: mine?.status === 'active' ? (mine.role as HallRole) : null,
});

/** A request older than the time limit is as good as gone: the person may ask again. */
const requestLive = (createdAt: Date, now: Date) => now.getTime() - createdAt.getTime() < REQUEST_TTL_MS;

function membershipOf(mine: Mine | null, now: Date = new Date()): TownHallDetail['membership'] {
  if (!mine) return 'none';
  if (mine.status === 'active') return 'active';
  if (mine.status === 'invited') return 'invited';
  return requestLive(mine.createdAt, now) ? 'requested' : 'none';
}

function toDetail(row: Row, viewerId: string, mine: Mine | null, ban: Ban | null = null): TownHallDetail {
  const listed = row.visibility !== 'invite';
  if (ban) {
    // Seen from inside a ban (ADR-042): a Town Hall that needs approval, where asking is never answered — the same
    // thing a quiet "no" looks like. A banned person never has a membership row.
    const membership = ban.askedAt && requestLive(ban.askedAt, new Date()) ? 'requested' : 'none';
    return {
      ...toSummary(row, viewerId, null),
      joinRule: 'approval',
      membership,
      canJoin: false,
      canAsk: listed && membership === 'none',
    };
  }
  const membership = membershipOf(mine);
  return {
    ...toSummary(row, viewerId, mine),
    membership,
    // A pending request on a Town Hall that has since stopped needing approval can simply join.
    canJoin: listed && row.joinRule === 'instant' && (membership === 'none' || membership === 'requested'),
    canAsk: listed && row.joinRule === 'approval' && membership === 'none',
  };
}

/** My membership row for one Town Hall, or null if I have none at all. */
async function myMembership(userId: string, townHallId: string): Promise<Mine | null> {
  const [row] = await getDb()
    .select({
      role: townHallMembers.role,
      status: townHallMembers.status,
      createdAt: townHallMembers.createdAt,
    })
    .from(townHallMembers)
    .where(and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Is this person banned from this Town Hall? (`tx`: read inside a transaction holding `lockPerson`.) */
async function banOf(townHallId: string, userId: string, tx: Tx | null = null): Promise<Ban | null> {
  const [row] = await (tx ?? getDb())
    .select({ askedAt: townHallBans.askedAt })
    .from(townHallBans)
    .where(and(eq(townHallBans.townHallId, townHallId), eq(townHallBans.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * Serialises everything that can put one person into one Town Hall (joining, asking, being invited) against banning
 * them, so a join racing a ban can never leave a banned person inside.
 */
const lockPerson = (tx: Tx, townHallId: string, userId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`townhall:${townHallId}:${userId}`}, 0))`);

/**
 * The Town Hall, if `userId` is on its staff (`ownerOnly`: is its owner). Everyone else — members included — gets the
 * same "not found" as before roles existed: the staff tools are not advertised.
 */
async function hallForStaff(
  userId: string,
  townHallId: string,
  ownerOnly = false,
): Promise<{ row: Row; role: 'owner' | 'deputy' }> {
  if (!townHallIdParamSchema.safeParse(townHallId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb().select().from(townHalls).where(eq(townHalls.id, townHallId)).limit(1);
  if (!row) throw new AppError('NOT_FOUND');
  const role = await activeRole(userId, townHallId);
  if (!isStaff(role) || (ownerOnly && role !== 'owner')) throw new AppError('NOT_FOUND');
  return { row, role };
}

/** Create a Town Hall. The creator becomes its owner in the same transaction — a Town Hall never exists without one. */
export async function createTownHall(
  ownerId: string,
  input: {
    name: string;
    description: string;
    visibility: TownHallVisibility;
    joinRule?: TownHallJoinRule | undefined;
  },
): Promise<TownHallDetail> {
  await enforceRateLimit(`townhalls:create:${ownerId}`, RATE.create);
  await enforceNewAccountLimit(ownerId, 'townHallCreate');
  const row = await getDb().transaction(async (tx) => {
    const [made] = await tx
      .insert(townHalls)
      .values({
        ownerId,
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        joinRule: input.joinRule ?? 'instant',
        createdAt: new Date(),
      })
      .returning();
    await tx
      .insert(townHallMembers)
      .values({ townHallId: made!.id, userId: ownerId, role: 'owner', status: 'active' });
    return made!;
  });
  return toDetail(row, ownerId, { role: 'owner', status: 'active', createdAt: row.createdAt });
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
        .select({
          townHallId: townHallMembers.townHallId,
          role: townHallMembers.role,
          status: townHallMembers.status,
          createdAt: townHallMembers.createdAt,
        })
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
  const mine = new Map(memberships.map((m) => [m.townHallId, m]));
  // Where the viewer is banned, the directory says "needs approval" too, as the Town Hall's own page does (ADR-042).
  const bans = page.length
    ? await getDb()
        .select({ townHallId: townHallBans.townHallId })
        .from(townHallBans)
        .where(
          and(
            eq(townHallBans.userId, viewerId),
            inArray(
              townHallBans.townHallId,
              page.map((r) => r.id),
            ),
          ),
        )
    : [];
  const banned = new Set(bans.map((b) => b.townHallId));

  const last = page.at(-1);
  return {
    townHalls: page.map((row) => ({
      ...toSummary(row, viewerId, mine.get(row.id) ?? null),
      ...(banned.has(row.id) ? { joinRule: 'approval' as const } : {}),
      joined: mine.has(row.id),
    })),
    nextCursor: more && last ? encodeCursor({ at: last.createdAt, id: last.id }) : null,
  };
}

/** Every Town Hall I currently belong to (owner, Deputy or member), whatever its visibility. Not paginated. */
export async function listMine(viewerId: string, now: Date = new Date()): Promise<MineItem[]> {
  await enforceRateLimit(`townhalls:read:${viewerId}`, RATE.read);
  const rows = await getDb()
    .select({
      id: townHalls.id,
      ownerId: townHalls.ownerId,
      name: townHalls.name,
      description: townHalls.description,
      visibility: townHalls.visibility,
      joinRule: townHalls.joinRule,
      createdAt: townHalls.createdAt,
      role: townHallMembers.role,
      status: townHallMembers.status,
      joinedAt: townHallMembers.createdAt,
    })
    .from(townHallMembers)
    .innerJoin(townHalls, eq(townHalls.id, townHallMembers.townHallId))
    .where(and(eq(townHallMembers.userId, viewerId), eq(townHallMembers.status, 'active')))
    .orderBy(desc(townHalls.createdAt))
    .limit(MINE_LIMIT);

  const staffHalls = rows.filter((r) => isStaff(r.role as HallRole)).map((r) => r.id);
  const waiting = staffHalls.length
    ? await getDb()
        .select({ townHallId: townHallMembers.townHallId, n: sql<number>`count(*)::int` })
        .from(townHallMembers)
        .where(
          and(
            inArray(townHallMembers.townHallId, staffHalls),
            eq(townHallMembers.status, 'requested'),
            isNull(townHallMembers.declinedAt),
            gt(townHallMembers.createdAt, new Date(now.getTime() - REQUEST_TTL_MS)),
          ),
        )
        .groupBy(townHallMembers.townHallId)
    : [];
  const counts = new Map(waiting.map((w) => [w.townHallId, w.n]));
  return rows.map((row) => ({
    ...toSummary(row, viewerId, { role: row.role, status: row.status, createdAt: row.joinedAt }),
    requestsWaiting: isStaff(row.role as HallRole) ? (counts.get(row.id) ?? 0) : null,
  }));
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

/**
 * One Town Hall, or null when the viewer may not know it exists: `invite` visibility is hidden from everyone without a
 * membership row (active or still-pending). `open`/`members` are visible to any active viewer.
 */
export async function getTownHall(viewerId: string, townHallId: string): Promise<TownHallDetail | null> {
  await enforceRateLimit(`townhalls:read:${viewerId}`, RATE.read);
  // The page calls this straight from the URL (in parallel with its gate layout): a malformed id is simply not found.
  if (!townHallIdParamSchema.safeParse(townHallId).success) return null;
  const [row] = await getDb().select().from(townHalls).where(eq(townHalls.id, townHallId)).limit(1);
  if (!row) return null;
  const mine = await myMembership(viewerId, townHallId);
  if (row.visibility === 'invite' && !mine) return null;
  return toDetail(row, viewerId, mine, mine ? null : await banOf(townHallId, viewerId));
}

/**
 * A Town Hall as a report needs it (ADR-025): whose it is and its words. Only for someone who may see it — the same
 * rule as `getTownHall` — so a report cannot be used to learn that an invite-only Town Hall exists.
 */
export async function townHallForReport(
  viewerId: string,
  townHallId: string,
): Promise<{ id: string; ownerId: string; name: string; description: string } | null> {
  const seen = await getTownHall(viewerId, townHallId);
  if (!seen) return null;
  const [row] = await getDb()
    .select({
      id: townHalls.id,
      ownerId: townHalls.ownerId,
      name: townHalls.name,
      description: townHalls.description,
    })
    .from(townHalls)
    .where(eq(townHalls.id, townHallId))
    .limit(1);
  return row ?? null;
}

/** A Town Hall's roster, paginated. Active members only (owner and Deputies included) — nobody else may read it. */
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
      return card ? [{ ...toRef(card), role: k.role as HallRole }] : [];
    }),
    nextCursor: next ? encodeCursor(next) : null,
  };
}

async function staffIdsOf(townHallId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: townHallMembers.userId })
    .from(townHallMembers)
    .where(
      and(
        eq(townHallMembers.townHallId, townHallId),
        eq(townHallMembers.status, 'active'),
        inArray(townHallMembers.role, ['owner', 'deputy']),
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * Join (or ask to join), leave, accept an invite, or decline one. Idempotent where that makes sense. On a Town Hall that
 * needs approval, `join` leaves a request for its staff; a request cannot be taken back, and a "no" is never announced —
 * it just runs out after 30 days, after which the person may ask again (ADR-041).
 */
export async function act(
  userId: string,
  townHallId: string,
  action: TownHallAction,
  now: Date = new Date(),
): Promise<TownHallDetail> {
  await enforceRateLimit(`townhalls:act:${userId}`, RATE.act);
  const [row] = await getDb().select().from(townHalls).where(eq(townHalls.id, townHallId)).limit(1);
  if (!row) throw new AppError('NOT_FOUND');
  const db = getDb();
  const mine = await myMembership(userId, townHallId);
  const where = and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, userId));
  let after: Mine | null = mine;

  switch (action) {
    case 'join': {
      if (row.visibility === 'invite') throw new AppError('NOT_FOUND');
      if (mine?.status === 'active' || mine?.status === 'invited') break;
      const done = await joinOrAsk(row, userId, mine, now);
      if (done.ban) return toDetail(row, userId, null, done.ban);
      after = done.after;
      if (done.asked) {
        emit({
          type: 'townhall.join_requested',
          townHallId,
          requesterId: userId,
          staffIds: await staffIdsOf(townHallId),
        });
      }
      break;
    }
    case 'leave': {
      if (mine?.role === 'owner') {
        throw new AppError('BAD_REQUEST', {
          message: 'The owner cannot leave — hand the Town Hall to a Deputy, or delete it.',
        });
      }
      const ban = mine ? null : await banOf(townHallId, userId);
      const askedAt = mine?.status === 'requested' ? mine.createdAt : ban?.askedAt;
      if (askedAt && requestLive(askedAt, now)) {
        throw new AppError('BAD_REQUEST', {
          message: 'A request cannot be taken back. It runs out by itself after 30 days.',
        });
      }
      if (ban) return toDetail(row, userId, null, ban);
      await db.delete(townHallMembers).where(where);
      after = null;
      break;
    }
    case 'accept': {
      if (!mine || mine.status !== 'invited') throw new AppError('NOT_FOUND');
      await db.update(townHallMembers).set({ status: 'active' }).where(where);
      emit({ type: 'townhall.invite_accepted', townHallId, ownerId: row.ownerId, inviteeId: userId });
      after = { ...mine, status: 'active' };
      break;
    }
    case 'decline': {
      if (!mine || mine.status !== 'invited') throw new AppError('NOT_FOUND');
      await db.delete(townHallMembers).where(where);
      after = null;
      break;
    }
  }

  // Built from what we already know, not re-read through getTownHall: leaving/declining an `invite`-only Town Hall
  // removes the only membership row that made it visible, so a re-read would (correctly) 404 on the very thing the
  // caller just did.
  return toDetail(row, userId, after);
}

/**
 * The `join` step itself, with the person locked against a ban. Joins at once, or leaves a request (`asked`: staff are
 * to be rung), or changes nothing if a live request is already there. A banned person (`ban` set) only ever "asks":
 * that spends the same daily budget and shows the same "Requested", but only stamps the ban row — nobody is rung and
 * nothing reaches staff's queue (ADR-042).
 */
async function joinOrAsk(
  row: Row,
  userId: string,
  mine: Mine | null,
  now: Date,
): Promise<{ after: Mine | null; asked: boolean; ban: Ban | null }> {
  return getDb().transaction(async (tx) => {
    await lockPerson(tx, row.id, userId);
    const where = and(eq(townHallMembers.townHallId, row.id), eq(townHallMembers.userId, userId));
    const ban = await banOf(row.id, userId, tx);
    if (ban) {
      if (ban.askedAt && requestLive(ban.askedAt, now)) return { after: null, asked: false, ban };
      await enforceRateLimit(`townhalls:request:${userId}`, RATE.request);
      await tx
        .update(townHallBans)
        .set({ askedAt: now })
        .where(and(eq(townHallBans.townHallId, row.id), eq(townHallBans.userId, userId)));
      return { after: null, asked: false, ban: { askedAt: now } };
    }
    if (row.joinRule === 'instant') {
      // A request left over from when it needed approval simply becomes a membership.
      if (mine) {
        await tx.update(townHallMembers).set({ status: 'active', declinedAt: null }).where(where);
      } else {
        await tx
          .insert(townHallMembers)
          .values({ townHallId: row.id, userId, role: 'member', status: 'active' })
          .onConflictDoNothing();
      }
      return { after: { role: 'member', status: 'active', createdAt: now }, asked: false, ban: null };
    }
    // Needs approval. A live request (answered or not) stays exactly as it is: asking again changes nothing.
    if (mine && requestLive(mine.createdAt, now)) return { after: mine, asked: false, ban: null };
    await enforceRateLimit(`townhalls:request:${userId}`, RATE.request);
    await tx
      .insert(townHallMembers)
      .values({ townHallId: row.id, userId, role: 'member', status: 'requested', createdAt: now })
      .onConflictDoUpdate({
        target: [townHallMembers.townHallId, townHallMembers.userId],
        set: { createdAt: now, declinedAt: null },
        setWhere: eq(townHallMembers.status, 'requested'),
      });
    return { after: { role: 'member', status: 'requested', createdAt: now }, asked: true, ban: null };
  });
}

/**
 * Invite someone by call sign. The owner or a Deputy. A repeat invite (already invited, or already a member) is a
 * harmless no-op; inviting someone who asked to join lets them in.
 */
export async function invite(inviterId: string, townHallId: string, handle: string): Promise<void> {
  await enforceRateLimit(`townhalls:invite:${inviterId}`, RATE.invite);
  await enforceNewAccountLimit(inviterId, 'townHallInvite');
  await hallForStaff(inviterId, townHallId);
  await enforceRateLimit(`townhalls:invite:${townHallId}`, RATE.invitePerHall);
  const target = await resolveHandle(handle);
  if (!target) throw new AppError('NOT_FOUND', { message: 'No one has that call sign.' });
  if (target.userId === inviterId) throw new AppError('BAD_REQUEST', { message: 'You are already in it.' });

  const theirs = await myMembership(target.userId, townHallId);
  if (theirs?.status === 'requested') {
    await approveRequest(inviterId, townHallId, target.userId);
    return;
  }
  const made = await getDb().transaction(async (tx) => {
    await lockPerson(tx, townHallId, target.userId);
    // Staff can see the ban list, so saying so hides nothing (ADR-042).
    if (await banOf(townHallId, target.userId, tx)) {
      throw new AppError('CONFLICT', { message: `@${target.handle} is banned here. Lift the ban first.` });
    }
    return tx
      .insert(townHallMembers)
      .values({ townHallId, userId: target.userId, role: 'member', status: 'invited' })
      .onConflictDoNothing()
      .returning({ userId: townHallMembers.userId });
  });
  if (made.length > 0) {
    emit({ type: 'townhall.invited', townHallId, inviterId, inviteeId: target.userId });
  }
}

async function approveRequest(staffId: string, townHallId: string, requesterId: string): Promise<boolean> {
  const done = await getDb()
    .update(townHallMembers)
    .set({ status: 'active', declinedAt: null })
    .where(
      and(
        eq(townHallMembers.townHallId, townHallId),
        eq(townHallMembers.userId, requesterId),
        eq(townHallMembers.status, 'requested'),
      ),
    )
    .returning({ userId: townHallMembers.userId });
  if (done.length > 0)
    emit({ type: 'townhall.request_approved', townHallId, approverId: staffId, requesterId });
  return done.length > 0;
}

/**
 * Remove a member by call sign, or revoke a pending invite or request. The owner may remove anyone but themself; a
 * Deputy only ordinary members (anything else is refused, and says so — they can see who is a Deputy).
 */
export async function removeMember(staffId: string, townHallId: string, targetHandle: string): Promise<void> {
  await enforceRateLimit(`townhalls:manage:${staffId}`, RATE.manage);
  const { role } = await hallForStaff(staffId, townHallId);
  const target = await resolveHandle(targetHandle);
  if (!target) throw new AppError('NOT_FOUND');
  if (target.userId === staffId) {
    throw new AppError('BAD_REQUEST', {
      message: role === 'owner' ? 'Hand the Town Hall over or delete it instead.' : 'Use "Leave" instead.',
    });
  }
  const theirs = await myMembership(target.userId, townHallId);
  if (!theirs) throw new AppError('NOT_FOUND');
  if (!outranks(role, theirs.status === 'active' ? (theirs.role as HallRole) : 'member')) {
    throw new AppError('FORBIDDEN', { message: 'Only the owner can remove a Deputy.' });
  }
  await getDb()
    .delete(townHallMembers)
    .where(and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, target.userId)));
}

/**
 * Ban someone by call sign (ADR-042): they lose any membership, invite or request here, and can never join again until
 * the ban is lifted. The owner or a Deputy; a member or a stranger alike. A Deputy may not ban the owner or a Deputy,
 * and the owner must stand a Deputy down first. Never announced to the banned person. Repeating it changes nothing.
 */
export async function banPerson(staffId: string, townHallId: string, handle: string): Promise<void> {
  await enforceRateLimit(`townhalls:manage:${staffId}`, RATE.manage);
  const { role } = await hallForStaff(staffId, townHallId);
  const target = await resolveHandle(handle);
  if (!target) throw new AppError('NOT_FOUND', { message: 'No one has that call sign.' });
  if (target.userId === staffId) throw new AppError('BAD_REQUEST', { message: 'You cannot ban yourself.' });
  await getDb().transaction(async (tx) => {
    await lockPerson(tx, townHallId, target.userId);
    const [theirs] = await tx
      .select({ role: townHallMembers.role, status: townHallMembers.status })
      .from(townHallMembers)
      .where(and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, target.userId)))
      .limit(1);
    const theirRole = theirs?.status === 'active' ? (theirs.role as HallRole) : null;
    if (theirRole === 'deputy' && role === 'owner') {
      throw new AppError('BAD_REQUEST', { message: 'Stand them down as Deputy first.' });
    }
    if (!outranks(role, theirRole)) {
      throw new AppError('FORBIDDEN', { message: 'A Deputy cannot ban the owner or another Deputy.' });
    }
    await tx
      .insert(townHallBans)
      .values({ townHallId, userId: target.userId, bannedBy: staffId })
      .onConflictDoNothing();
    await tx
      .delete(townHallMembers)
      .where(and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, target.userId)));
  });
}

/** Lift a ban (owner or a Deputy). They are not let back in — they may join again like anyone. Idempotent. */
export async function liftBan(staffId: string, townHallId: string, handle: string): Promise<void> {
  await enforceRateLimit(`townhalls:manage:${staffId}`, RATE.manage);
  await hallForStaff(staffId, townHallId);
  const target = await resolveHandle(handle);
  if (!target) throw new AppError('NOT_FOUND');
  await getDb()
    .delete(townHallBans)
    .where(and(eq(townHallBans.townHallId, townHallId), eq(townHallBans.userId, target.userId)));
}

/**
 * Who is banned here, newest first (owner or a Deputy only; everyone else the same 404). Unlike the request queue,
 * people the viewer hid are kept: staff must be able to find a ban to lift it. Accounts that are not active are left
 * out until they are (their ban stays).
 */
export async function listBans(staffId: string, townHallId: string): Promise<BanEntry[]> {
  await enforceRateLimit(`townhalls:read:${staffId}`, RATE.read);
  await hallForStaff(staffId, townHallId);
  const rows = await getDb()
    .select({
      userId: townHallBans.userId,
      bannedBy: townHallBans.bannedBy,
      createdAt: townHallBans.createdAt,
    })
    .from(townHallBans)
    .where(eq(townHallBans.townHallId, townHallId))
    .orderBy(desc(townHallBans.createdAt), desc(townHallBans.userId))
    .limit(BANS_LIMIT);
  const cards = await getCards(rows.flatMap((r) => (r.bannedBy ? [r.userId, r.bannedBy] : [r.userId])));
  return rows.flatMap((r) => {
    const card = cards.get(r.userId);
    if (!card) return [];
    const by = r.bannedBy ? cards.get(r.bannedBy) : undefined;
    return [{ ...toRef(card), bannedAt: r.createdAt, bannedBy: by?.handle ?? null }];
  });
}

/**
 * Staff decisions about one person (ADR-041). `approve`/`decline` a join request (owner or Deputy); `make_deputy`,
 * `make_member` and `make_owner` are the owner's alone. Every one is idempotent; anything that does not apply is a 404.
 */
export async function memberAction(
  staffId: string,
  townHallId: string,
  targetHandle: string,
  action: MemberAction,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(`townhalls:manage:${staffId}`, RATE.manage);
  const ownerOnly = action === 'make_deputy' || action === 'make_member' || action === 'make_owner';
  await hallForStaff(staffId, townHallId, ownerOnly);
  const target = await resolveHandle(targetHandle);
  if (!target || target.userId === staffId) throw new AppError('NOT_FOUND');
  const theirs = await myMembership(target.userId, townHallId);
  if (!theirs) throw new AppError('NOT_FOUND');
  const db = getDb();
  const where = and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, target.userId));

  switch (action) {
    case 'approve':
    case 'decline': {
      if (theirs.status === 'active' && action === 'approve') return; // already in
      if (theirs.status !== 'requested' || !requestLive(theirs.createdAt, now))
        throw new AppError('NOT_FOUND');
      if (action === 'approve') {
        await approveRequest(staffId, townHallId, target.userId);
      } else {
        // Never announced: the asker keeps seeing "Requested" until it runs out.
        await db
          .update(townHallMembers)
          .set({ declinedAt: now })
          .where(and(where, eq(townHallMembers.status, 'requested'), isNull(townHallMembers.declinedAt)));
      }
      return;
    }
    case 'make_deputy': {
      if (theirs.status !== 'active') throw new AppError('NOT_FOUND');
      if (theirs.role === 'deputy') return;
      await db
        .update(townHallMembers)
        .set({ role: 'deputy' })
        .where(and(where, eq(townHallMembers.role, 'member')));
      emit({ type: 'townhall.made_deputy', townHallId, ownerId: staffId, deputyId: target.userId });
      return;
    }
    case 'make_member': {
      if (theirs.status !== 'active') throw new AppError('NOT_FOUND');
      await db
        .update(townHallMembers)
        .set({ role: 'member' })
        .where(and(where, eq(townHallMembers.role, 'deputy')));
      return;
    }
    case 'make_owner': {
      if (theirs.status !== 'active' || theirs.role !== 'deputy') {
        throw new AppError('BAD_REQUEST', {
          message: 'Make them a Deputy first: only a Deputy can take over.',
        });
      }
      await transferOwnership(townHallId, staffId, target.userId);
      emit({ type: 'townhall.made_owner', townHallId, fromId: staffId, toId: target.userId });
      return;
    }
  }
}

/**
 * Hand the Town Hall from `fromId` (its owner) to `toId` (an active Deputy) in one transaction, the hall row locked: the
 * old owner becomes a Deputy, the new one the owner, and `town_halls.owner_id` follows. Throws if either has changed.
 */
async function transferOwnership(townHallId: string, fromId: string, toId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [hall] = await tx
      .select({ ownerId: townHalls.ownerId })
      .from(townHalls)
      .where(eq(townHalls.id, townHallId))
      .for('update');
    if (!hall || hall.ownerId !== fromId) throw new AppError('NOT_FOUND');
    // Old owner first: at most one `owner` row may exist at any moment.
    await tx
      .update(townHallMembers)
      .set({ role: 'deputy' })
      .where(and(eq(townHallMembers.townHallId, townHallId), eq(townHallMembers.userId, fromId)));
    const promoted = await tx
      .update(townHallMembers)
      .set({ role: 'owner' })
      .where(
        and(
          eq(townHallMembers.townHallId, townHallId),
          eq(townHallMembers.userId, toId),
          eq(townHallMembers.status, 'active'),
          eq(townHallMembers.role, 'deputy'),
        ),
      )
      .returning({ userId: townHallMembers.userId });
    if (promoted.length === 0)
      throw new AppError('CONFLICT', { message: 'They are no longer a Deputy here.' });
    await tx.update(townHalls).set({ ownerId: toId }).where(eq(townHalls.id, townHallId));
  });
}

/** Join requests waiting for an answer (owner or Deputy only), oldest first. People this viewer hid are left out. */
export async function listRequests(
  staffId: string,
  townHallId: string,
  now: Date = new Date(),
): Promise<JoinRequest[]> {
  await enforceRateLimit(`townhalls:read:${staffId}`, RATE.read);
  await hallForStaff(staffId, townHallId);
  const rows = await getDb()
    .select({ userId: townHallMembers.userId, createdAt: townHallMembers.createdAt })
    .from(townHallMembers)
    .where(
      and(
        eq(townHallMembers.townHallId, townHallId),
        eq(townHallMembers.status, 'requested'),
        isNull(townHallMembers.declinedAt),
        gt(townHallMembers.createdAt, new Date(now.getTime() - REQUEST_TTL_MS)),
      ),
    )
    .orderBy(asc(townHallMembers.createdAt))
    .limit(REQUESTS_LIMIT);
  const ids = rows.map((r) => r.userId);
  const [cards, hidden] = await Promise.all([getCards(ids), hiddenAuthors(staffId, ids)]);
  return rows.flatMap((r) => {
    const card = cards.get(r.userId);
    return card && !hidden.has(r.userId) ? [{ ...toRef(card), askedAt: r.createdAt }] : [];
  });
}

/** Change name, description, visibility and/or how it is joined. Owner only. */
export async function updateTownHall(
  ownerId: string,
  townHallId: string,
  patch: {
    name?: string | undefined;
    description?: string | undefined;
    visibility?: TownHallVisibility | undefined;
    joinRule?: TownHallJoinRule | undefined;
  },
): Promise<TownHallDetail> {
  await enforceRateLimit(`townhalls:manage:${ownerId}`, RATE.manage);
  await hallForStaff(ownerId, townHallId, true);
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  if (patch.joinRule !== undefined) set.joinRule = patch.joinRule;
  const [row] = await getDb()
    .update(townHalls)
    .set(set)
    .where(and(eq(townHalls.id, townHallId), eq(townHalls.ownerId, ownerId)))
    .returning();
  if (!row) throw new AppError('NOT_FOUND');
  return toDetail(row, ownerId, { role: 'owner', status: 'active', createdAt: row.createdAt });
}

/** Delete a Town Hall and every membership in it (cascade). Owner only. */
export async function deleteTownHall(ownerId: string, townHallId: string): Promise<void> {
  await enforceRateLimit(`townhalls:manage:${ownerId}`, RATE.manage);
  const rows = await getDb()
    .delete(townHalls)
    .where(and(eq(townHalls.id, townHallId), eq(townHalls.ownerId, ownerId)))
    .returning({ id: townHalls.id });
  if (rows.length === 0) throw new AppError('NOT_FOUND');
}

/**
 * Before an account is erased (ADR-027): every Town Hall it owns passes to its longest-serving Deputy, so the community
 * outlives its founder. A Town Hall with no Deputy goes with the account, as before. No Chime: the old owner's account is
 * already closed, so there is nobody to name as the sender.
 */
export async function handOverTownHalls(userId: string): Promise<{ handedOver: number }> {
  const owned = await getDb()
    .select({ id: townHalls.id })
    .from(townHalls)
    .where(eq(townHalls.ownerId, userId));
  let handedOver = 0;
  for (const { id } of owned) {
    const [heir] = await getDb()
      .select({ userId: townHallMembers.userId })
      .from(townHallMembers)
      .where(
        and(
          eq(townHallMembers.townHallId, id),
          eq(townHallMembers.status, 'active'),
          eq(townHallMembers.role, 'deputy'),
        ),
      )
      .orderBy(asc(townHallMembers.createdAt), asc(townHallMembers.userId))
      .limit(1);
    if (!heir) continue;
    await transferOwnership(id, userId, heir.userId);
    handedOver += 1;
  }
  return { handedOver };
}

/**
 * Retention: join requests that ran out (answered "no" or never answered) are deleted after 30 days, and so is when a
 * banned person last asked (the ban itself stays until lifted; ADR-042).
 */
export async function purgeExpiredRequests(now: Date = new Date()): Promise<{ requests: number }> {
  const cutoff = new Date(now.getTime() - REQUEST_TTL_MS);
  const rows = await getDb()
    .delete(townHallMembers)
    .where(and(eq(townHallMembers.status, 'requested'), lt(townHallMembers.createdAt, cutoff)))
    .returning({ userId: townHallMembers.userId });
  const asks = await getDb()
    .update(townHallBans)
    .set({ askedAt: null })
    .where(lt(townHallBans.askedAt, cutoff))
    .returning({ userId: townHallBans.userId });
  return { requests: rows.length + asks.length };
}
