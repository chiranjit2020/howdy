import { notificationPrefs, notifications, postCards } from '@db/schema';
import { and, desc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { canFence } from '@/modules/authz';
import { getCards, getFenceResource, type PersonCard } from '@/modules/profiles';
import { pushTo } from '@/modules/push';
import { fenceStanding, hiddenAuthors, posseMembersAmong } from '@/modules/relationships';
import { decodeCursor, encodeCursor, type Cursor } from '@/platform/cursor';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import type { DomainEvent } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import {
  CHIME_MAX_PAGE_SIZE,
  CHIME_PAGE_SIZE,
  UNREAD_CAP,
  type ChimeCategory,
  type ChimePrefs,
} from '@/shared/validation/chimes';
import type { PortraitTint } from '@/shared/validation/profile';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
/** All limits fail closed. Reads are per person; nothing here depends on who anyone else is. */
export const RATE = {
  read: rule(240, 60),
  mark: rule(120, 3600),
  prefs: rule(30, 3600),
} as const;

/** Read Chimes are kept this long, unread ones longer (see docs/DATA_LIFECYCLE.md). */
export const READ_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const UNREAD_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
/** People looked at per round while filling a page, and rounds per request (bounded work). */
const MAX_ROUNDS = 4;

export type ChimeType =
  | 'posse_requested'
  | 'posse_accepted'
  | 'card_created'
  | 'card_waiting'
  | 'card_approved'
  | 'reply_created'
  | 'reply_waiting'
  | 'yo_given'
  | 'whisper_received'
  | 'tribute_waiting'
  | 'tribute_approved'
  | 'mark_given'
  | 'townhall_invited'
  | 'townhall_invite_accepted'
  | 'capsule_opened';

const CATEGORY: Record<ChimeType, ChimeCategory> = {
  posse_requested: 'posse',
  posse_accepted: 'posse',
  card_created: 'fence',
  card_waiting: 'fence',
  card_approved: 'fence',
  reply_waiting: 'fence',
  reply_created: 'replies',
  yo_given: 'yo',
  whisper_received: 'whispers',
  tribute_waiting: 'tributes',
  tribute_approved: 'tributes',
  mark_given: 'tributes',
  townhall_invited: 'townhalls',
  townhall_invite_accepted: 'townhalls',
  capsule_opened: 'capsules',
};

/** Chimes the recipient needs in order to act (the owner decides what waits), so a restricted writer still rings them. */
const ACTIONABLE: ReadonlySet<ChimeType> = new Set(['card_waiting', 'reply_waiting', 'tribute_waiting']);
/** Chimes that only make sense while the card is public. */
const NEEDS_PUBLISHED: ReadonlySet<ChimeType> = new Set([
  'card_created',
  'card_approved',
  'reply_created',
  'yo_given',
]);

const DEFAULT_PREFS: ChimePrefs = {
  posse: true,
  fence: true,
  replies: true,
  yo: true,
  whispers: true,
  tributes: true,
  townhalls: true,
  capsules: true,
};

// ─── writing Chimes (from domain events) ─────────────────────────────────────────────────────────────────────────────

async function prefsOf(userId: string): Promise<ChimePrefs> {
  const [row] = await getDb().select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  return row
    ? {
        posse: row.posse,
        fence: row.fence,
        replies: row.replies,
        yo: row.yo,
        whispers: row.whispers,
        tributes: row.tributes,
        townhalls: row.townhalls,
        capsules: row.capsules,
      }
    : DEFAULT_PREFS;
}

/**
 * Ring one person's bell, unless they should not hear it: the two must both be active; a block in either direction, or a
 * mute by the recipient, means silence; someone the recipient restricted rings only for things the recipient must act on;
 * and the recipient can switch whole kinds off. Nothing here is ever visible to the person who acted.
 */
async function deliver(
  recipientId: string,
  actorId: string,
  type: ChimeType,
  cardId: string | null,
  opts: { bump?: boolean } = {},
): Promise<void> {
  // Nobody is Chimed about their own actions — except a Time Capsule from their past self opening (ADR-028).
  if (recipientId === actorId && type !== 'capsule_opened') return;
  const people = await getCards([recipientId, actorId]);
  if (!people.has(recipientId) || !people.has(actorId)) return;
  if ((await hiddenAuthors(recipientId, [actorId])).has(actorId)) return;
  if (!ACTIONABLE.has(type) && (await fenceStanding(recipientId, actorId)).restricted) return;
  if (!(await prefsOf(recipientId))[CATEGORY[type]]) return;

  const now = new Date(); // whole milliseconds, so paging cursors compare exactly
  const db = getDb();
  if (opts.bump && cardId === null) {
    // A fresh ask (or accept) between the same two people rings again; the ask budget already bounds how often that can be.
    await db.execute(sql`
      insert into notifications (recipient_id, actor_id, type, created_at)
      values (${recipientId}, ${actorId}, ${type}, ${now})
      on conflict (recipient_id, actor_id, type) where card_id is null
      do update set created_at = excluded.created_at, read_at = null`);
  } else {
    const stored = await db
      .insert(notifications)
      .values({ recipientId, actorId, type, cardId, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (stored.length === 0) return; // a repeat never rings again, so it never pushes again either
  }
  await pushChime(recipientId, actorId, type, cardId);
}

/**
 * Send the Chime that was just stored to the person's devices. The words come from the SAME read-time filter and wording as
 * the Chimes list, so a push can never say more than the bell would — and a Chime the list would hide is not pushed at all.
 */
async function pushChime(recipientId: string, actorId: string, type: ChimeType, cardId: string | null) {
  const [row] = await base()
    .where(
      and(
        eq(notifications.recipientId, recipientId),
        eq(notifications.actorId, actorId),
        eq(notifications.type, type),
        cardId === null ? isNull(notifications.cardId) : eq(notifications.cardId, cardId),
      ),
    )
    .limit(1);
  if (!row) return;
  const [shown] = await visible(recipientId, [row]);
  const me = (await getCards([recipientId])).get(recipientId);
  if (!shown || !me) return;
  const { text, href } = describe(recipientId, shown, me.handle);
  await pushTo(recipientId, {
    title: 'Howdy',
    body: text,
    url: href,
    // One notification per thread / per card: a new one replaces the last instead of stacking up.
    tag:
      type === 'whisper_received'
        ? `whisper:${shown.actor.handle}`
        : `${type}:${cardId ?? shown.actor.handle}`,
    badge: await unreadCount(recipientId),
  });
}

/** Turn what happened into Chimes. Subscribed to the domain events at start-up (src/instrumentation.ts). */
export async function handleEvent(event: DomainEvent): Promise<void> {
  switch (event.type) {
    case 'posse.requested':
      return deliver(event.targetId, event.actorId, 'posse_requested', null, { bump: true });
    case 'posse.accepted':
      return deliver(event.targetId, event.actorId, 'posse_accepted', null, { bump: true });
    case 'card.created':
      return deliver(event.ownerId, event.authorId, 'card_created', event.cardId);
    case 'card.waiting':
      // Review and Restrict look the same to the owner — and nothing reaches the writer.
      return deliver(event.ownerId, event.authorId, 'card_waiting', event.cardId);
    case 'card.approved':
      // Only a card the writer was told was "waiting" gets an answer. Approving a card held because the writer is
      // Restricted must stay silent: a "your card was approved" Chime would tell them they had been restricted.
      if (event.wasPending) await deliver(event.authorId, event.ownerId, 'card_approved', event.cardId);
      return;
    case 'reply.created': {
      await deliver(event.cardAuthorId, event.authorId, 'reply_created', event.cardId);
      if (event.ownerId !== event.cardAuthorId) {
        await deliver(event.ownerId, event.authorId, 'reply_created', event.cardId);
      }
      return;
    }
    case 'reply.waiting':
      return deliver(event.ownerId, event.authorId, 'reply_waiting', event.cardId);
    case 'yo.given':
      return deliver(event.cardAuthorId, event.actorId, 'yo_given', event.cardId);
    case 'whisper.sent':
      // Words held because the sender is Restricted ring nobody: the recipient chose to limit them, and a Chime would also
      // be the one place those words could leak.
      if (!event.held)
        await deliver(event.recipientId, event.senderId, 'whisper_received', null, { bump: true });
      return;
    case 'tribute.given':
      // Actionable like a waiting card: the owner must be told even if they have Restricted this Posse member.
      return deliver(event.ownerId, event.authorId, 'tribute_waiting', null, { bump: true });
    case 'tribute.approved':
      return deliver(event.authorId, event.ownerId, 'tribute_approved', null, { bump: true });
    case 'mark.given':
      // Which kind is never in the Chime text: the Ranch's aggregate breakdown is the only place a kind is shown.
      return deliver(event.targetId, event.raterId, 'mark_given', null, { bump: true });
    case 'townhall.invited':
      return deliver(event.inviteeId, event.ownerId, 'townhall_invited', null, { bump: true });
    case 'townhall.invite_accepted':
      return deliver(event.ownerId, event.inviteeId, 'townhall_invite_accepted', null, { bump: true });
    case 'capsule.opened':
      // The words are never in the Chime (or the push): only that one opened, and from whom.
      return deliver(event.recipientId, event.authorId, 'capsule_opened', null, { bump: true });
  }
}

// ─── reading Chimes ──────────────────────────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  type: string;
  actorId: string;
  cardId: string | null;
  createdAt: Date;
  readAt: Date | null;
  fenceOwnerId: string | null;
  cardAuthorId: string | null;
  cardStatus: string | null;
}

export interface ChimeView {
  id: string;
  type: ChimeType;
  text: string;
  /** Where tapping it goes. Always an in-app path. */
  href: string;
  actor: { handle: string; displayName: string; portraitTint: PortraitTint };
  at: Date;
  unread: boolean;
}

export interface ChimePage {
  chimes: ChimeView[];
  nextCursor: string | null;
  /** Unread Chimes the person can actually see, capped at UNREAD_CAP. */
  unread: number;
}

const SELECT = {
  id: notifications.id,
  type: notifications.type,
  actorId: notifications.actorId,
  cardId: notifications.cardId,
  createdAt: notifications.createdAt,
  readAt: notifications.readAt,
  fenceOwnerId: postCards.fenceOwnerId,
  cardAuthorId: postCards.authorId,
  cardStatus: postCards.status,
} as const;

/** May `userId` read `ownerId`'s Fence right now? Same policy as the Fence itself. */
async function mayReadFence(userId: string, ownerId: string): Promise<boolean> {
  if (userId === ownerId) return true;
  const fence = await getFenceResource(ownerId);
  if (!fence) return false;
  const ctx = await fenceStanding(ownerId, userId);
  return canFence({ kind: 'user', id: userId, status: 'active' }, 'fence:read', fence, ctx).allow;
}

interface Shown {
  row: Row;
  actor: PersonCard;
  ownerHandle: string | null;
}

/**
 * The authoritative filter, applied every time Chimes are read (and counted): anything the person should not see NOW is
 * left out, whatever it was when it was written. That covers people they have since muted or blocked (or who blocked
 * them), accounts that are no longer active, and cards on a Fence they can no longer read.
 */
async function visible(userId: string, rows: Row[]): Promise<Shown[]> {
  if (rows.length === 0) return [];
  const actorIds = rows.map((r) => r.actorId);
  const ownerIds = [...new Set(rows.flatMap((r) => (r.fenceOwnerId ? [r.fenceOwnerId] : [])))];
  const [people, hidden, readable, openThreads] = await Promise.all([
    getCards([...actorIds, ...ownerIds, userId]),
    hiddenAuthors(userId, actorIds),
    Promise.all(ownerIds.map(async (id) => [id, await mayReadFence(userId, id)] as const)),
    posseMembersAmong(userId, actorIds),
  ]);
  const canRead = new Map(readable);
  return rows.flatMap((row) => {
    const actor = people.get(row.actorId);
    if (!actor || hidden.has(row.actorId)) return [];
    // A Whisper Chime only shows while the thread is still open (still in each other's Posse, no block).
    if (row.type === 'whisper_received' && !openThreads.has(row.actorId)) return [];
    if (row.cardId !== null) {
      if (!row.fenceOwnerId || !canRead.get(row.fenceOwnerId)) return [];
      if (NEEDS_PUBLISHED.has(row.type as ChimeType) && row.cardStatus !== 'published') return [];
    }
    const owner = row.fenceOwnerId ? people.get(row.fenceOwnerId) : undefined;
    return [{ row, actor, ownerHandle: owner?.handle ?? null }];
  });
}

function describe(userId: string, s: Shown, myHandle: string): { text: string; href: string } {
  const name = s.actor.displayName;
  const fence = s.ownerHandle ? `/porch/${s.ownerHandle}` : `/porch/${myHandle}`;
  switch (s.row.type as ChimeType) {
    case 'posse_requested':
      return { text: `${name} wants to be your Pal.`, href: '/pals' };
    case 'posse_accepted':
      return { text: `${name} said yes. You are Pals now.`, href: `/porch/${s.actor.handle}` };
    case 'card_created':
      return { text: `${name} nailed a card to your Fence.`, href: fence };
    case 'card_waiting':
      return { text: `A card from ${name} is waiting for your approval.`, href: `/porch/${myHandle}` };
    case 'card_approved':
      return { text: `${name} approved your card. It is on the Fence now.`, href: fence };
    case 'reply_created':
      return {
        text:
          s.row.cardAuthorId === userId
            ? `${name} scribbled a reply on your card.`
            : `${name} scribbled a reply on a card on your Fence.`,
        href: fence,
      };
    case 'reply_waiting':
      return { text: `A reply from ${name} is waiting for your approval.`, href: `/porch/${myHandle}` };
    case 'yo_given':
      return { text: `${name} reacted to your card.`, href: fence };
    case 'whisper_received':
      return { text: `${name} whispered to you.`, href: `/whispers/${s.actor.handle}` };
    case 'tribute_waiting':
      return { text: `A Tribute from ${name} is waiting for your approval.`, href: `/porch/${myHandle}` };
    case 'tribute_approved':
      // The actor here is the owner who approved it — always the right Ranch to link to.
      return {
        text: `${name} approved your Tribute. It is on their Porch now.`,
        href: `/porch/${s.actor.handle}`,
      };
    case 'mark_given':
      return { text: `${name} gave you a Mark.`, href: `/porch/${myHandle}` };
    case 'townhall_invited':
      return { text: `${name} invited you to a Town Hall.`, href: '/town-halls' };
    case 'townhall_invite_accepted':
      return { text: `${name} accepted your Town Hall invite.`, href: '/town-halls' };
    case 'capsule_opened':
      return {
        text:
          s.row.actorId === userId
            ? 'A Time Capsule from your past self just opened.'
            : `A Time Capsule from ${name} just opened.`,
        href: '/capsules',
      };
  }
}

const cursorWhere = (c: Cursor | null) =>
  c ? sql`(${notifications.createdAt}, ${notifications.id}) < (${c.at}, ${c.id})` : undefined;

const base = () =>
  getDb().select(SELECT).from(notifications).leftJoin(postCards, eq(postCards.id, notifications.cardId));

/** Unread Chimes the person can see, up to UNREAD_CAP. Uses the same filter as the list, so the two always agree. */
export async function unreadCount(userId: string): Promise<number> {
  const rows: Row[] = await base()
    .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(UNREAD_CAP + 1);
  return Math.min((await visible(userId, rows)).length, UNREAD_CAP);
}

/** One page of the person's Chimes, newest first, with the unread count. A bad cursor is a 400. */
export async function listChimes(
  userId: string,
  opts: { cursor?: string | undefined; limit?: number | undefined },
): Promise<ChimePage> {
  let position: Cursor | null = null;
  if (opts.cursor !== undefined) {
    position = decodeCursor(opts.cursor);
    if (!position) throw new AppError('BAD_REQUEST', { message: 'That page marker is not valid.' });
  }
  await enforceRateLimit(`chimes:read:${userId}`, RATE.read);
  const limit = Math.min(Math.max(opts.limit ?? CHIME_PAGE_SIZE, 1), CHIME_MAX_PAGE_SIZE);

  const kept: Shown[] = [];
  let next: Cursor | null = null;
  for (let round = 0; round < MAX_ROUNDS && kept.length < limit; round++) {
    const rows: Row[] = await base()
      .where(and(eq(notifications.recipientId, userId), cursorWhere(position)))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1);
    const more = rows.length > limit;
    const page = rows.slice(0, limit);
    const shown = await visible(userId, page);
    const shownIds = new Map(shown.map((s) => [s.row.id, s]));

    let last: Row | undefined;
    let consumed = 0;
    for (const row of page) {
      last = row;
      consumed++;
      const s = shownIds.get(row.id);
      if (s) {
        kept.push(s);
        if (kept.length === limit) break;
      }
    }
    if (last) position = { at: last.createdAt, id: last.id };
    const rest = page.length - consumed > 0 || more;
    if (!rest) {
      next = null;
      break;
    }
    next = position;
  }

  const me = (await getCards([userId])).get(userId);
  const myHandle = me?.handle ?? '';
  return {
    chimes: kept.map((s) => ({
      id: s.row.id,
      type: s.row.type as ChimeType,
      ...describe(userId, s, myHandle),
      actor: {
        handle: s.actor.handle,
        displayName: s.actor.displayName,
        portraitTint: s.actor.portraitTint,
      },
      at: s.row.createdAt,
      unread: s.row.readAt === null,
    })),
    nextCursor: next ? encodeCursor(next) : null,
    unread: await unreadCount(userId),
  };
}

/** Mark Chimes read — only ever the caller's own. Ids that are not theirs are ignored exactly like ids that do not exist. */
export async function markRead(
  userId: string,
  target: { all: true; before?: string | undefined } | { ids: string[] },
): Promise<{ marked: number }> {
  await enforceRateLimit(`chimes:mark:${userId}`, RATE.mark);
  const mine = and(
    eq(notifications.recipientId, userId),
    isNull(notifications.readAt),
    'all' in target && target.before ? lte(notifications.createdAt, new Date(target.before)) : undefined,
  );
  const rows = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where('all' in target ? mine : and(mine, inArray(notifications.id, target.ids)))
    .returning({ id: notifications.id });
  return { marked: rows.length };
}

// ─── preferences ─────────────────────────────────────────────────────────────────────────────────────────────────────

export async function getPrefs(userId: string): Promise<ChimePrefs> {
  return prefsOf(userId);
}

export async function setPrefs(userId: string, patch: Partial<ChimePrefs>): Promise<ChimePrefs> {
  await enforceRateLimit(`chimes:prefs:${userId}`, RATE.prefs);
  const next = { ...(await prefsOf(userId)) };
  for (const key of Object.keys(next) as ChimeCategory[])
    if (patch[key] !== undefined) next[key] = patch[key]!;
  await getDb()
    .insert(notificationPrefs)
    .values({ userId, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: notificationPrefs.userId, set: { ...next, updatedAt: new Date() } });
  return next;
}

// ─── retention ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Retention: drop Chimes read more than 30 days ago and unread ones older than 90 days. Returns how many were removed. */
export async function purgeOldChimes(now: Date = new Date()): Promise<{ chimes: number }> {
  const rows = await getDb()
    .delete(notifications)
    .where(
      or(
        and(
          isNotNull(notifications.readAt),
          lt(notifications.readAt, new Date(now.getTime() - READ_RETENTION_MS)),
        ),
        and(
          isNull(notifications.readAt),
          lt(notifications.createdAt, new Date(now.getTime() - UNREAD_RETENTION_MS)),
        ),
      ),
    )
    .returning({ id: notifications.id });
  return { chimes: rows.length };
}
