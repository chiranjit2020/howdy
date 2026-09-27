import { cardReplies, postCards, yos } from '@db/schema';
import { and, asc, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { canFence, holdFor, type Actor, type FenceContext, type FenceResource } from '@/modules/authz';
import { getCards, getFenceResource, resolveHandle, type PersonCard } from '@/modules/profiles';
import { fenceStanding, hiddenAuthors } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import {
  FENCE_MAX_PAGE_SIZE,
  FENCE_PAGE_SIZE,
  REACTION_KINDS,
  REPLIES_PER_CARD,
  idParamSchema,
  type ReactionKind,
} from '@/shared/validation/fence';
import type { PortraitTint } from '@/shared/validation/profile';
import { decodeCursor, encodeCursor, type Cursor } from '@/platform/cursor';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });

const isReactionKind = (k: string): k is ReactionKind => (REACTION_KINDS as readonly string[]).includes(k);
const emptyReactions = (): Record<ReactionKind, number> =>
  Object.fromEntries(REACTION_KINDS.map((k) => [k, 0])) as Record<ReactionKind, number>;
const reactionFields = (reactions: Record<ReactionKind, number>, mine: ReactionKind | null) => ({
  yoCount: REACTION_KINDS.reduce((sum, k) => sum + reactions[k], 0),
  yoByMe: mine !== null,
  reactions,
  myReaction: mine,
});

/**
 * Every limit fails closed. Per-person limits are spent BEFORE anything is looked up, so they behave identically whatever
 * the target is. The per-Fence limits are spent only AFTER the person has been allowed to reach that Fence — spending them
 * earlier would let someone who has been blocked (or never had access) tell a real Fence from a missing one by when the
 * limit trips.
 */
export const RATE = {
  readUser: rule(240, 60),
  readAnonymous: rule(60, 60),
  postUser: rule(20, 3600),
  /** The source's "3 cards per hour per Fence": one person cannot flood one wall. */
  postPerFence: rule(3, 3600),
  /** Everything strangers nail to one Fence in an hour, so several accounts cannot bury a wall together. */
  postIntoFence: rule(120, 3600),
  replyUser: rule(60, 3600),
  replyPerFence: rule(12, 3600),
  yo: rule(200, 3600),
  manage: rule(120, 3600),
} as const;

/** Waiting cards and replies nobody answered are dropped after this long (see docs/DATA_LIFECYCLE.md). */
export const PENDING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Most people we look at while filling one page, so hiding lots of authors cannot make one request unbounded. */
const MAX_ROUNDS = 4;
const QUEUE_LIMIT = 50;

export interface AuthorRef {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  /** The Howdy team account (Verified badge). */
  verified: boolean;
}

export interface ReplyView {
  id: string;
  body: string;
  createdAt: Date;
  author: AuthorRef;
  mine: boolean;
  /** Only ever true for the writer of a reply that is honestly waiting for approval. */
  waiting: boolean;
  canRemove: boolean;
}

export interface CardView {
  id: string;
  body: string;
  createdAt: Date;
  author: AuthorRef;
  mine: boolean;
  /** Only ever true for the writer of a card that is honestly waiting for approval (Review is on). */
  waiting: boolean;
  canRemove: boolean;
  /** May the viewer react to this card (Yo or any other reaction)? */
  canYo: boolean;
  canReply: boolean;
  /** All reactions of every kind. */
  yoCount: number;
  /** Has the viewer reacted at all? */
  yoByMe: boolean;
  /** Count per kind, always present even at zero. Never who gave which. */
  reactions: Record<ReactionKind, number>;
  /** The viewer's own reaction, if any. */
  myReaction: ReactionKind | null;
  replies: ReplyView[];
}

export interface FencePage {
  cards: CardView[];
  nextCursor: string | null;
  isOwner: boolean;
  /** May the viewer nail a card here? */
  canPost: boolean;
  /** Cards from other people wait for the owner (told to would-be writers so it is not a surprise). */
  review: boolean;
}

const toRef = (p: PersonCard): AuthorRef => ({
  handle: p.handle,
  displayName: p.displayName,
  portraitTint: p.portraitTint,
  verified: p.verified,
});

const actorOf = (userId: string): Actor => ({ kind: 'user', id: userId, status: 'active' });

async function contextFor(viewer: Actor, fence: FenceResource): Promise<FenceContext> {
  if (viewer.kind !== 'user') return { relationship: 'UNKNOWN', restricted: false };
  return fenceStanding(fence.ownerId, viewer.id);
}

/** Load the Fence and the viewer's standing on it, or null when they may not read it (hidden ≡ missing). */
async function access(
  viewer: Actor,
  ownerId: string,
): Promise<{ fence: FenceResource; ctx: FenceContext } | null> {
  const fence = await getFenceResource(ownerId);
  if (!fence) return null;
  const ctx = await contextFor(viewer, fence);
  return canFence(viewer, 'fence:read', fence, ctx).allow ? { fence, ctx } : null;
}

interface CardRow {
  id: string;
  fenceOwnerId: string;
  authorId: string;
  body: string;
  status: string;
  createdAt: Date;
}

interface ReplyRow {
  id: string;
  cardId: string;
  authorId: string;
  body: string;
  status: string;
  createdAt: Date;
}

/** Someone's cards are shown only while their account is active (getCards drops the rest). */
async function authorsFor(ids: string[]): Promise<Map<string, PersonCard>> {
  return getCards(ids);
}

async function hydrate(
  viewer: Actor,
  fence: FenceResource,
  ctx: FenceContext,
  rows: CardRow[],
  authors: Map<string, PersonCard>,
): Promise<CardView[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const viewerId = viewer.kind === 'user' ? viewer.id : null;
  const isOwner = viewerId === fence.ownerId;
  const ids = rows.map((r) => r.id);

  const canPostHere = canFence(viewer, 'fence:post', fence, ctx).allow;
  const canReactHere = canFence(viewer, 'fence:react', fence, ctx).allow;

  const [counts, mine, replyRows] = await Promise.all([
    db
      .select({ cardId: yos.cardId, kind: yos.kind, n: count() })
      .from(yos)
      .where(inArray(yos.cardId, ids))
      .groupBy(yos.cardId, yos.kind),
    viewerId
      ? db
          .select({ cardId: yos.cardId, kind: yos.kind })
          .from(yos)
          .where(and(inArray(yos.cardId, ids), eq(yos.userId, viewerId)))
      : Promise.resolve([] as { cardId: string; kind: string }[]),
    db
      .select()
      .from(cardReplies)
      .where(
        and(
          inArray(cardReplies.cardId, ids),
          viewerId
            ? or(eq(cardReplies.status, 'published'), eq(cardReplies.authorId, viewerId))
            : eq(cardReplies.status, 'published'),
        ),
      )
      .orderBy(asc(cardReplies.createdAt), asc(cardReplies.id))
      // Replies per card are capped at write time; this only bounds the read.
      .limit(ids.length * (REPLIES_PER_CARD + 5)),
  ]);

  const replyAuthors = await authorsFor(replyRows.map((r: ReplyRow) => r.authorId));
  const hidden = viewerId
    ? await hiddenAuthors(
        viewerId,
        replyRows.map((r: ReplyRow) => r.authorId),
      )
    : new Set<string>();
  const reactionsByCard = new Map<string, Record<ReactionKind, number>>();
  for (const c of counts) {
    if (!isReactionKind(c.kind)) continue;
    const r = reactionsByCard.get(c.cardId) ?? emptyReactions();
    r[c.kind] = c.n;
    reactionsByCard.set(c.cardId, r);
  }
  const myReaction = new Map(
    mine.flatMap((m) => (isReactionKind(m.kind) ? [[m.cardId, m.kind] as const] : [])),
  );

  const repliesByCard = new Map<string, ReplyView[]>();
  for (const r of replyRows as ReplyRow[]) {
    const author = replyAuthors.get(r.authorId);
    if (!author || hidden.has(r.authorId)) continue;
    const list = repliesByCard.get(r.cardId) ?? [];
    if (list.length >= REPLIES_PER_CARD) continue;
    list.push({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      author: toRef(author),
      mine: r.authorId === viewerId,
      waiting: r.authorId === viewerId && r.status === 'pending',
      canRemove: isOwner || r.authorId === viewerId,
    });
    repliesByCard.set(r.cardId, list);
  }

  return rows.flatMap((row) => {
    const author = authors.get(row.authorId);
    if (!author) return [];
    const published = row.status === 'published';
    return [
      {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt,
        author: toRef(author),
        mine: row.authorId === viewerId,
        waiting: row.authorId === viewerId && row.status === 'pending',
        canRemove: isOwner || row.authorId === viewerId,
        canYo: published && canReactHere && row.authorId !== viewerId,
        canReply: published && canPostHere,
        ...reactionFields(reactionsByCard.get(row.id) ?? emptyReactions(), myReaction.get(row.id) ?? null),
        replies: repliesByCard.get(row.id) ?? [],
      },
    ];
  });
}

/**
 * One page of a Fence, newest first, or null when the viewer may not read it (missing, inactive and hidden are the same).
 * The page holds published cards plus the viewer's own waiting cards. People the viewer muted or is in a block with are
 * left out, and so are people whose account is no longer active. Paging is by keyset cursor; a bad cursor is a 400.
 */
export async function listFence(
  viewer: Actor,
  handle: string,
  opts: { rateKey: string; cursor?: string | undefined; limit?: number | undefined },
): Promise<FencePage | null> {
  let cursor: Cursor | null = null;
  if (opts.cursor !== undefined) {
    cursor = decodeCursor(opts.cursor);
    if (!cursor) throw new AppError('BAD_REQUEST', { message: 'That page marker is not valid.' });
  }
  await enforceRateLimit(
    `fence:read:${opts.rateKey}`,
    viewer.kind === 'user' ? RATE.readUser : RATE.readAnonymous,
  );
  const limit = Math.min(Math.max(opts.limit ?? FENCE_PAGE_SIZE, 1), FENCE_MAX_PAGE_SIZE);

  // The limit above is spent before the handle is looked up, so hitting it looks the same for a real Fence, a hidden one
  // and one that does not exist.
  const owner = await resolveHandle(handle);
  if (!owner) return null;
  const ownerId = owner.userId;
  const acc = await access(viewer, ownerId);
  if (!acc) return null;
  const { fence, ctx } = acc;
  const viewerId = viewer.kind === 'user' ? viewer.id : null;

  const kept: CardRow[] = [];
  const keptAuthors = new Map<string, PersonCard>();
  let next: Cursor | null = null;
  let position = cursor;

  for (let round = 0; round < MAX_ROUNDS && kept.length < limit; round++) {
    const rows: CardRow[] = await getDb()
      .select()
      .from(postCards)
      .where(
        and(
          eq(postCards.fenceOwnerId, ownerId),
          viewerId
            ? or(eq(postCards.status, 'published'), eq(postCards.authorId, viewerId))
            : eq(postCards.status, 'published'),
          position
            ? sql`(${postCards.createdAt}, ${postCards.id}) < (${position.at}, ${position.id})`
            : undefined,
        ),
      )
      .orderBy(desc(postCards.createdAt), desc(postCards.id))
      .limit(limit + 1);
    const more = rows.length > limit;
    const page = rows.slice(0, limit);
    const authors = await authorsFor(page.map((r) => r.authorId));
    const hidden = viewerId
      ? await hiddenAuthors(
          viewerId,
          page.map((r) => r.authorId),
        )
      : new Set<string>();

    let last: CardRow | undefined;
    let consumed = 0;
    for (const row of page) {
      last = row;
      consumed++;
      const author = authors.get(row.authorId);
      if (author && !hidden.has(row.authorId)) {
        kept.push(row);
        keptAuthors.set(row.authorId, author);
        if (kept.length === limit) break;
      }
    }
    const rest = page.length - consumed > 0 || more;
    position = last ? { at: last.createdAt, id: last.id } : position;
    if (!rest) {
      next = null;
      break;
    }
    next = position;
  }

  return {
    cards: await hydrate(viewer, fence, ctx, kept, keptAuthors),
    nextCursor: next ? encodeCursor(next) : null,
    isOwner: viewerId === ownerId,
    canPost: canFence(viewer, 'fence:post', fence, ctx).allow,
    review: fence.fenceReview && viewerId !== ownerId,
  };
}

/** Everything an action on one card needs: the card, its Fence and the viewer's standing. Null = "no such card" to them. */
interface CardContext {
  card: CardRow;
  fence: FenceResource;
  ctx: FenceContext;
  actor: Actor;
  isOwner: boolean;
}

async function loadCard(userId: string, cardId: string): Promise<CardContext | null> {
  if (!idParamSchema.safeParse(cardId).success) return null;
  const [card] = await getDb().select().from(postCards).where(eq(postCards.id, cardId)).limit(1);
  if (!card) return null;
  const actor = actorOf(userId);
  const acc = await access(actor, card.fenceOwnerId);
  if (!acc) return null;
  const isOwner = userId === card.fenceOwnerId;
  // Waiting cards belong to their writer and the Fence owner alone.
  if (card.status !== 'published' && card.authorId !== userId && !isOwner) return null;
  if ((await hiddenAuthors(userId, [card.authorId])).has(card.authorId)) return null;
  if (!(await authorsFor([card.authorId])).has(card.authorId)) return null;
  return { card, fence: acc.fence, ctx: acc.ctx, actor, isOwner };
}

/** Nail a Post Card on the Fence of the person with call sign `handle`. */
export async function postCard(userId: string, handle: string, body: string): Promise<CardView> {
  // Spent before the handle is looked up: the same limit trips whether the Fence exists, is hidden or is a made-up name.
  await enforceRateLimit(`fence:post:${userId}`, RATE.postUser);
  const owner = await resolveHandle(handle);
  if (!owner) throw new AppError('NOT_FOUND');
  const ownerId = owner.userId;
  const actor = actorOf(userId);
  const acc = await access(actor, ownerId);
  if (!acc) throw new AppError('NOT_FOUND');
  const { fence, ctx } = acc;
  if (!canFence(actor, 'fence:post', fence, ctx).allow) {
    throw new AppError('FORBIDDEN', { message: 'This Fence is not open for new cards from you.' });
  }
  if (userId !== ownerId) {
    await enforceRateLimit(`fence:post:${userId}:${ownerId}`, RATE.postPerFence);
    await enforceRateLimit(`fence:into:${ownerId}`, RATE.postIntoFence);
  }
  const status = holdFor(actor, 'card', fence, ctx);
  // Written with millisecond precision so cursors compare exactly (see cursor.ts).
  const [row] = await getDb()
    .insert(postCards)
    .values({ fenceOwnerId: ownerId, authorId: userId, body, status, createdAt: new Date() })
    .returning();
  emit({
    type: status === 'published' ? 'card.created' : 'card.waiting',
    cardId: row!.id,
    ownerId,
    authorId: userId,
  });
  const authors = await authorsFor([userId]);
  const [view] = await hydrate(actor, fence, ctx, [row!], authors);
  if (!view) throw new AppError('INTERNAL');
  return view;
}

/** Write a reply on the back of a published card. Restricted writers' replies are held, without being told. */
export async function postReply(userId: string, cardId: string, body: string): Promise<ReplyView> {
  await enforceRateLimit(`fence:reply:${userId}`, RATE.replyUser);
  const loaded = await loadCard(userId, cardId);
  if (!loaded || loaded.card.status !== 'published') throw new AppError('NOT_FOUND');
  const { card, fence, ctx, actor } = loaded;
  if (!canFence(actor, 'fence:post', fence, ctx).allow) {
    throw new AppError('FORBIDDEN', { message: 'This Fence is not open for replies from you.' });
  }
  if (userId !== fence.ownerId) {
    await enforceRateLimit(`fence:reply:${userId}:${fence.ownerId}`, RATE.replyPerFence);
  }
  const status = holdFor(actor, 'reply', fence, ctx);
  const row = await getDb().transaction(async (tx) => {
    // Lock the card so two replies cannot both take the last free place.
    await tx.execute(sql`select 1 from ${postCards} where ${postCards.id} = ${card.id} for update`);
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(cardReplies)
      .where(and(eq(cardReplies.cardId, card.id), eq(cardReplies.status, 'published')));
    // Same answer for everybody (restricted writers included), so a full card says nothing about who is restricted.
    if (n >= REPLIES_PER_CARD) throw new AppError('CONFLICT', { message: 'This card is full.' });
    const [inserted] = await tx
      .insert(cardReplies)
      .values({ cardId: card.id, authorId: userId, body, status, createdAt: new Date() })
      .returning();
    return inserted!;
  });
  emit(
    status === 'published'
      ? {
          type: 'reply.created',
          cardId: card.id,
          ownerId: fence.ownerId,
          cardAuthorId: card.authorId,
          authorId: userId,
        }
      : { type: 'reply.waiting', cardId: card.id, ownerId: fence.ownerId, authorId: userId },
  );
  const me = (await authorsFor([userId])).get(userId);
  if (!me) throw new AppError('INTERNAL');
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    author: toRef(me),
    mine: true,
    waiting: false,
    canRemove: true,
  };
}

/**
 * Give, change or take back your reaction (Yo by default). Giving needs the right to read the Fence and a published card
 * that is not your own. Taking one back always works (undoing is never gated) and reveals nothing about the card. Only a
 * brand-new reaction rings the author's bell: switching kind, or switching off and on, never does twice.
 */
export async function setYo(
  userId: string,
  cardId: string,
  on: boolean,
  kind: ReactionKind = 'yo',
): Promise<{ yoByMe: boolean; myReaction: ReactionKind | null }> {
  await enforceRateLimit(`fence:yo:${userId}`, RATE.yo);
  if (!idParamSchema.safeParse(cardId).success) throw new AppError('NOT_FOUND');
  if (!on) {
    await getDb()
      .delete(yos)
      .where(and(eq(yos.cardId, cardId), eq(yos.userId, userId)));
    return { yoByMe: false, myReaction: null };
  }
  const loaded = await loadCard(userId, cardId);
  if (!loaded || loaded.card.status !== 'published') throw new AppError('NOT_FOUND');
  if (!canFence(loaded.actor, 'fence:react', loaded.fence, loaded.ctx).allow) throw new AppError('NOT_FOUND');
  if (loaded.card.authorId === userId) {
    throw new AppError('BAD_REQUEST', { message: 'You cannot Yo your own card.' });
  }
  const db = getDb();
  const made = await db
    .insert(yos)
    .values({ cardId, userId, kind })
    .onConflictDoNothing()
    .returning({ cardId: yos.cardId });
  if (made.length === 0) {
    await db
      .update(yos)
      .set({ kind })
      .where(and(eq(yos.cardId, cardId), eq(yos.userId, userId)));
  }
  // Only a reaction that is really new is an event, so changing or re-giving one cannot ring the bell again.
  if (made.length > 0) {
    emit({
      type: 'yo.given',
      cardId,
      ownerId: loaded.card.fenceOwnerId,
      cardAuthorId: loaded.card.authorId,
      actorId: userId,
    });
  }
  return { yoByMe: true, myReaction: kind };
}

/**
 * Take a card down ("Scrape clean" for the Fence owner, "Take it back" for its writer). The writer can always remove their
 * own card, even after being blocked; the owner can remove anything on their Fence; nobody else can, and nobody else can
 * tell whether the card exists.
 */
export async function removeCard(userId: string, cardId: string): Promise<void> {
  await enforceRateLimit(`fence:manage:${userId}`, RATE.manage);
  if (!idParamSchema.safeParse(cardId).success) throw new AppError('NOT_FOUND');
  const [card] = await getDb().select().from(postCards).where(eq(postCards.id, cardId)).limit(1);
  if (!card || (card.authorId !== userId && card.fenceOwnerId !== userId)) throw new AppError('NOT_FOUND');
  await getDb().delete(postCards).where(eq(postCards.id, cardId));
}

export async function removeReply(userId: string, replyId: string): Promise<void> {
  await enforceRateLimit(`fence:manage:${userId}`, RATE.manage);
  if (!idParamSchema.safeParse(replyId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb()
    .select({ authorId: cardReplies.authorId, ownerId: postCards.fenceOwnerId })
    .from(cardReplies)
    .innerJoin(postCards, eq(postCards.id, cardReplies.cardId))
    .where(eq(cardReplies.id, replyId))
    .limit(1);
  if (!row || (row.authorId !== userId && row.ownerId !== userId)) throw new AppError('NOT_FOUND');
  await getDb().delete(cardReplies).where(eq(cardReplies.id, replyId));
}

/** Let a waiting card through. Owner only. Approval bumps it to "now" so readers already past that spot still see it. */
export async function approveCard(ownerId: string, cardId: string): Promise<void> {
  await enforceRateLimit(`fence:manage:${ownerId}`, RATE.manage);
  if (!idParamSchema.safeParse(cardId).success) throw new AppError('NOT_FOUND');
  const [card] = await getDb()
    .select()
    .from(postCards)
    .where(and(eq(postCards.id, cardId), eq(postCards.fenceOwnerId, ownerId)))
    .limit(1);
  if (!card) throw new AppError('NOT_FOUND');
  if (card.status === 'published') return;
  await getDb()
    .update(postCards)
    .set({ status: 'published', createdAt: new Date() })
    .where(and(eq(postCards.id, cardId), eq(postCards.fenceOwnerId, ownerId)));
  emit({
    type: 'card.approved',
    cardId,
    ownerId,
    authorId: card.authorId,
    wasPending: card.status === 'pending',
  });
}

export async function approveReply(ownerId: string, replyId: string): Promise<void> {
  await enforceRateLimit(`fence:manage:${ownerId}`, RATE.manage);
  if (!idParamSchema.safeParse(replyId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb()
    .select({ status: cardReplies.status, cardId: cardReplies.cardId })
    .from(cardReplies)
    .innerJoin(postCards, eq(postCards.id, cardReplies.cardId))
    .where(and(eq(cardReplies.id, replyId), eq(postCards.fenceOwnerId, ownerId)))
    .limit(1);
  if (!row) throw new AppError('NOT_FOUND');
  if (row.status === 'published') return;
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select 1 from ${postCards} where ${postCards.id} = ${row.cardId} for update`);
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(cardReplies)
      .where(and(eq(cardReplies.cardId, row.cardId), eq(cardReplies.status, 'published')));
    if (n >= REPLIES_PER_CARD) throw new AppError('CONFLICT', { message: 'That card is full.' });
    await tx
      .update(cardReplies)
      .set({ status: 'published', createdAt: new Date() })
      .where(eq(cardReplies.id, replyId));
  });
}

export interface WaitingCard {
  id: string;
  body: string;
  createdAt: Date;
  author: AuthorRef;
}
export interface WaitingReply extends WaitingCard {
  onCard: string;
}
export interface Waiting {
  cards: WaitingCard[];
  replies: WaitingReply[];
}

/**
 * What is waiting for the owner's approval (Review cards and Restricted people's cards and replies alike — the owner sees
 * them the same way). People the owner blocked or muted, and inactive accounts, are left out.
 */
export async function listWaiting(ownerId: string): Promise<Waiting> {
  await enforceRateLimit(`fence:manage:${ownerId}`, RATE.manage);
  const db = getDb();
  const notPublished = inArray(postCards.status, ['pending', 'held']);
  const [cards, replies] = await Promise.all([
    db
      .select()
      .from(postCards)
      .where(and(eq(postCards.fenceOwnerId, ownerId), notPublished))
      .orderBy(desc(postCards.createdAt), desc(postCards.id))
      .limit(QUEUE_LIMIT),
    db
      .select({ reply: cardReplies, cardBody: postCards.body })
      .from(cardReplies)
      .innerJoin(postCards, eq(postCards.id, cardReplies.cardId))
      .where(and(eq(postCards.fenceOwnerId, ownerId), inArray(cardReplies.status, ['pending', 'held'])))
      .orderBy(desc(cardReplies.createdAt), desc(cardReplies.id))
      .limit(QUEUE_LIMIT),
  ]);
  const ids = [...cards.map((c) => c.authorId), ...replies.map((r) => r.reply.authorId)];
  const [authors, hidden] = await Promise.all([authorsFor(ids), hiddenAuthors(ownerId, ids)]);
  const ok = (id: string) => authors.has(id) && !hidden.has(id);
  return {
    cards: cards
      .filter((c) => ok(c.authorId))
      .map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        author: toRef(authors.get(c.authorId)!),
      })),
    replies: replies
      .filter((r) => ok(r.reply.authorId))
      .map((r) => ({
        id: r.reply.id,
        body: r.reply.body,
        createdAt: r.reply.createdAt,
        author: toRef(authors.get(r.reply.authorId)!),
        onCard: r.cardBody,
      })),
  };
}

/** A card the reader may see, in the shape a report needs (the writer and a snapshot of the text). Null otherwise. */
export async function cardForReport(
  userId: string,
  cardId: string,
): Promise<{ id: string; authorId: string; body: string } | null> {
  const loaded = await loadCard(userId, cardId);
  return loaded ? { id: loaded.card.id, authorId: loaded.card.authorId, body: loaded.card.body } : null;
}

/** Retention: drop waiting cards and replies nobody answered for 30 days. Returns how many rows were removed. */
export async function purgeStaleWaiting(now: Date = new Date()): Promise<{ cards: number; replies: number }> {
  const cutoff = new Date(now.getTime() - PENDING_RETENTION_MS);
  const db = getDb();
  const replies = await db
    .delete(cardReplies)
    .where(and(inArray(cardReplies.status, ['pending', 'held']), lt(cardReplies.createdAt, cutoff)))
    .returning({ id: cardReplies.id });
  const cards = await db
    .delete(postCards)
    .where(and(inArray(postCards.status, ['pending', 'held']), lt(postCards.createdAt, cutoff)))
    .returning({ id: postCards.id });
  return { cards: cards.length, replies: replies.length };
}
