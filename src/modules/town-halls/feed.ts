import { townHallMembers, townHallPosts, townHallReactions, townHallReplies, townHalls } from '@db/schema';
import { and, asc, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { enforceNewAccountLimit, shouldHoldForOthers } from '@/modules/moderation';
import { getCards, type PersonCard } from '@/modules/profiles';
import { hiddenAuthors } from '@/modules/relationships';
import { decodeCursor, encodeCursor, type Cursor } from '@/platform/cursor';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import {
  REACTION_KINDS,
  REPLIES_PER_CARD,
  idParamSchema,
  type ReactionKind,
} from '@/shared/validation/fence';
import type { PortraitTint } from '@/shared/validation/profile';
import { HALL_FEED_MAX_PAGE_SIZE, HALL_FEED_PAGE_SIZE } from '@/shared/validation/town-halls';
import { activeRole, isStaff, outranks, rolesIn, type HallRole } from './roles';

/**
 * A Town Hall's feed (ADR-033): posts by its members, short replies and reactions. Only ACTIVE members read or write it;
 * to everyone else a post is "not found" — the same answer as a post that does not exist. The same protections as the
 * Fence apply: people the viewer blocked, muted or is blocked by are left out, inactive accounts are left out, and an
 * author many people have reported lately is held for the staff's OK (looking posted to them). The owner and Deputies
 * keep order (ADR-041): a Deputy acts on ordinary members' words, the owner on anyone's.
 */

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });

/** Every limit fails closed. Per-person limits are spent BEFORE anything is looked up. */
export const FEED_RATE = {
  read: rule(240, 60),
  post: rule(20, 3600),
  /** One person cannot flood one Town Hall. Spent only once they are known to be a member. */
  postPerHall: rule(10, 3600),
  reply: rule(60, 3600),
  react: rule(200, 3600),
  manage: rule(120, 3600),
} as const;

/** Held posts and replies the owner never answered are dropped after this long (see docs/DATA_LIFECYCLE.md). */
export const HELD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ROUNDS = 4;
const HELD_LIMIT = 50;

export interface HallAuthor {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  verified: boolean;
  trusted: boolean;
  /** Filled in by the app layer only when the viewer may see it. */
  portraitUrl?: string;
}

export interface HallReplyView {
  id: string;
  body: string;
  createdAt: Date;
  author: HallAuthor;
  mine: boolean;
  canRemove: boolean;
}

export interface HallPostView {
  id: string;
  body: string;
  createdAt: Date;
  author: HallAuthor;
  mine: boolean;
  canRemove: boolean;
  canReact: boolean;
  canReply: boolean;
  /** Count per kind, always present even at zero. Never who gave which. */
  reactions: Record<ReactionKind, number>;
  myReaction: ReactionKind | null;
  replies: HallReplyView[];
}

export interface HallFeedPage {
  posts: HallPostView[];
  nextCursor: string | null;
}

export interface HeldPost {
  id: string;
  body: string;
  createdAt: Date;
  author: HallAuthor;
}
export interface HeldReply extends HeldPost {
  onPost: string;
}
export interface HeldItems {
  posts: HeldPost[];
  replies: HeldReply[];
}

const toAuthor = (p: PersonCard): HallAuthor => ({
  handle: p.handle,
  displayName: p.displayName,
  portraitTint: p.portraitTint,
  verified: p.verified,
  trusted: p.trusted,
});

const isReactionKind = (k: string): k is ReactionKind => (REACTION_KINDS as readonly string[]).includes(k);
const emptyReactions = (): Record<ReactionKind, number> =>
  Object.fromEntries(REACTION_KINDS.map((k) => [k, 0])) as Record<ReactionKind, number>;

interface Hall {
  id: string;
  ownerId: string;
  /** The member's own role here (they are always an active member when they hold a Hall). */
  myRole: HallRole;
}

/** The Town Hall, when this person is an active member of it; null otherwise (hidden ≡ missing). */
async function hallForMember(userId: string, townHallId: string): Promise<Hall | null> {
  if (!idParamSchema.safeParse(townHallId).success) return null;
  const [row] = await getDb()
    .select({ id: townHalls.id, ownerId: townHalls.ownerId, myRole: sql<HallRole>`${townHallMembers.role}` })
    .from(townHalls)
    .innerJoin(
      townHallMembers,
      and(
        eq(townHallMembers.townHallId, townHalls.id),
        eq(townHallMembers.userId, userId),
        eq(townHallMembers.status, 'active'),
      ),
    )
    .where(eq(townHalls.id, townHallId))
    .limit(1);
  return row ?? null;
}

interface PostRow {
  id: string;
  townHallId: string;
  authorId: string;
  body: string;
  status: string;
  createdAt: Date;
}

/**
 * A post this member may see right now, with its Town Hall; null otherwise. Held posts belong to their writer and the
 * staff alone; a post by someone the viewer has hidden, or by an inactive account, is not there for them.
 */
async function loadPost(userId: string, postId: string): Promise<{ post: PostRow; hall: Hall } | null> {
  if (!idParamSchema.safeParse(postId).success) return null;
  const [post] = await getDb().select().from(townHallPosts).where(eq(townHallPosts.id, postId)).limit(1);
  if (!post) return null;
  const hall = await hallForMember(userId, post.townHallId);
  if (!hall) return null;
  if (post.status !== 'published' && post.authorId !== userId && !isStaff(hall.myRole)) return null;
  const [hidden, authors] = await Promise.all([
    hiddenAuthors(userId, [post.authorId]),
    getCards([post.authorId]),
  ]);
  if (hidden.has(post.authorId) || !authors.has(post.authorId)) return null;
  return { post, hall };
}

async function hydrate(
  viewerId: string,
  hall: Hall,
  rows: PostRow[],
  authors: Map<string, PersonCard>,
): Promise<HallPostView[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const [counts, mine, replyRows] = await Promise.all([
    db
      .select({ postId: townHallReactions.postId, kind: townHallReactions.kind, n: count() })
      .from(townHallReactions)
      .where(inArray(townHallReactions.postId, ids))
      .groupBy(townHallReactions.postId, townHallReactions.kind),
    db
      .select({ postId: townHallReactions.postId, kind: townHallReactions.kind })
      .from(townHallReactions)
      .where(and(inArray(townHallReactions.postId, ids), eq(townHallReactions.userId, viewerId))),
    db
      .select()
      .from(townHallReplies)
      .where(
        and(
          inArray(townHallReplies.postId, ids),
          or(eq(townHallReplies.status, 'published'), eq(townHallReplies.authorId, viewerId)),
        ),
      )
      .orderBy(asc(townHallReplies.createdAt), asc(townHallReplies.id))
      // Replies per post are capped at write time; this only bounds the read.
      .limit(ids.length * (REPLIES_PER_CARD + 5)),
  ]);

  const replyAuthorIds = replyRows.map((r) => r.authorId);
  const [replyAuthors, hidden, roles] = await Promise.all([
    getCards(replyAuthorIds),
    hiddenAuthors(viewerId, replyAuthorIds),
    // Only staff need to know who outranks whom.
    isStaff(hall.myRole)
      ? rolesIn(hall.id, [...replyAuthorIds, ...rows.map((r) => r.authorId)])
      : Promise.resolve(new Map<string, HallRole>()),
  ]);
  const mayRemove = (authorId: string) =>
    authorId === viewerId || outranks(hall.myRole, roles.get(authorId) ?? null);
  const reactionsByPost = new Map<string, Record<ReactionKind, number>>();
  for (const c of counts) {
    if (!isReactionKind(c.kind)) continue;
    const r = reactionsByPost.get(c.postId) ?? emptyReactions();
    r[c.kind] = c.n;
    reactionsByPost.set(c.postId, r);
  }
  const myReaction = new Map(
    mine.flatMap((m) => (isReactionKind(m.kind) ? [[m.postId, m.kind] as const] : [])),
  );
  const repliesByPost = new Map<string, HallReplyView[]>();
  for (const r of replyRows) {
    const author = replyAuthors.get(r.authorId);
    if (!author || hidden.has(r.authorId)) continue;
    const list = repliesByPost.get(r.postId) ?? [];
    if (list.length >= REPLIES_PER_CARD) continue;
    list.push({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      author: toAuthor(author),
      mine: r.authorId === viewerId,
      canRemove: mayRemove(r.authorId),
    });
    repliesByPost.set(r.postId, list);
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
        author: toAuthor(author),
        mine: row.authorId === viewerId,
        canRemove: mayRemove(row.authorId),
        canReact: published && row.authorId !== viewerId,
        canReply: published,
        reactions: reactionsByPost.get(row.id) ?? emptyReactions(),
        myReaction: myReaction.get(row.id) ?? null,
        replies: repliesByPost.get(row.id) ?? [],
      },
    ];
  });
}

/**
 * One page of a Town Hall's feed, newest first, or null when the viewer is not an active member. Holds published posts
 * plus the viewer's own held ones (which look posted to them). A bad cursor is a 400.
 */
export async function listFeed(
  viewerId: string,
  townHallId: string,
  opts: { cursor?: string | undefined; limit?: number | undefined },
): Promise<HallFeedPage | null> {
  let cursor: Cursor | null = null;
  if (opts.cursor !== undefined) {
    cursor = decodeCursor(opts.cursor);
    if (!cursor) throw new AppError('BAD_REQUEST', { message: 'That page marker is not valid.' });
  }
  await enforceRateLimit(`townhalls:feed:${viewerId}`, FEED_RATE.read);
  const hall = await hallForMember(viewerId, townHallId);
  if (!hall) return null;
  const limit = Math.min(Math.max(opts.limit ?? HALL_FEED_PAGE_SIZE, 1), HALL_FEED_MAX_PAGE_SIZE);

  const kept: PostRow[] = [];
  const keptAuthors = new Map<string, PersonCard>();
  let next: Cursor | null = null;
  let position = cursor;
  for (let round = 0; round < MAX_ROUNDS && kept.length < limit; round++) {
    const rows: PostRow[] = await getDb()
      .select()
      .from(townHallPosts)
      .where(
        and(
          eq(townHallPosts.townHallId, hall.id),
          or(eq(townHallPosts.status, 'published'), eq(townHallPosts.authorId, viewerId)),
          position
            ? sql`(${townHallPosts.createdAt}, ${townHallPosts.id}) < (${position.at}, ${position.id})`
            : undefined,
        ),
      )
      .orderBy(desc(townHallPosts.createdAt), desc(townHallPosts.id))
      .limit(limit + 1);
    const more = rows.length > limit;
    const page = rows.slice(0, limit);
    const pageAuthors = page.map((r) => r.authorId);
    const [authors, hidden] = await Promise.all([
      getCards(pageAuthors),
      hiddenAuthors(viewerId, pageAuthors),
    ]);

    let last: PostRow | undefined;
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
    posts: await hydrate(viewerId, hall, kept, keptAuthors),
    nextCursor: next ? encodeCursor(next) : null,
  };
}

/**
 * Staff's own words are never held (they would only be letting themselves through); anyone else's are when enough
 * people have reported them lately (ADR-024). `hall` is the AUTHOR's own view of it.
 */
async function statusFor(hall: Hall, authorId: string): Promise<'published' | 'held'> {
  if (isStaff(hall.myRole)) return 'published';
  return (await shouldHoldForOthers(authorId)) ? 'held' : 'published';
}

/** Post to a Town Hall's feed. Active members only. */
export async function createPost(userId: string, townHallId: string, body: string): Promise<HallPostView> {
  // Spent before the Town Hall is looked up: the same limit trips whether it exists, is hidden or is made up.
  await enforceRateLimit(`townhalls:post:${userId}`, FEED_RATE.post);
  await enforceNewAccountLimit(userId, 'card');
  const hall = await hallForMember(userId, townHallId);
  if (!hall) throw new AppError('NOT_FOUND');
  await enforceRateLimit(`townhalls:post:${userId}:${hall.id}`, FEED_RATE.postPerHall);
  const status = await statusFor(hall, userId);
  // Written with millisecond precision so cursors compare exactly (see cursor.ts).
  const [row] = await getDb()
    .insert(townHallPosts)
    .values({ townHallId: hall.id, authorId: userId, body, status, createdAt: new Date() })
    .returning();
  const [view] = await hydrate(userId, hall, [row!], await getCards([userId]));
  if (!view) throw new AppError('INTERNAL');
  return view;
}

/** Reply to a published post. Held writers' replies wait for the owner, without being told. */
export async function createReply(userId: string, postId: string, body: string): Promise<HallReplyView> {
  await enforceRateLimit(`townhalls:reply:${userId}`, FEED_RATE.reply);
  await enforceNewAccountLimit(userId, 'reply');
  const loaded = await loadPost(userId, postId);
  if (!loaded || loaded.post.status !== 'published') throw new AppError('NOT_FOUND');
  const { post, hall } = loaded;
  const status = await statusFor(hall, userId);
  const row = await getDb().transaction(async (tx) => {
    // Lock the post so two replies cannot both take the last free place.
    await tx.execute(sql`select 1 from ${townHallPosts} where ${townHallPosts.id} = ${post.id} for update`);
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(townHallReplies)
      .where(and(eq(townHallReplies.postId, post.id), eq(townHallReplies.status, 'published')));
    if (n >= REPLIES_PER_CARD) throw new AppError('CONFLICT', { message: 'This post is full.' });
    const [inserted] = await tx
      .insert(townHallReplies)
      .values({ postId: post.id, authorId: userId, body, status, createdAt: new Date() })
      .returning();
    return inserted!;
  });
  if (status === 'published') {
    emit({ type: 'hall.reply_created', postId: post.id, postAuthorId: post.authorId, authorId: userId });
  }
  const me = (await getCards([userId])).get(userId);
  if (!me) throw new AppError('INTERNAL');
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    author: toAuthor(me),
    mine: true,
    canRemove: true,
  };
}

/**
 * Give, change or take back your reaction. Giving needs a published post you may see that is not your own. Taking one
 * back always works and reveals nothing. Only a brand-new reaction rings the author's bell.
 */
export async function setReaction(
  userId: string,
  postId: string,
  on: boolean,
  kind: ReactionKind = 'yo',
): Promise<{ myReaction: ReactionKind | null }> {
  await enforceRateLimit(`townhalls:react:${userId}`, FEED_RATE.react);
  await enforceNewAccountLimit(userId, 'reaction');
  if (!idParamSchema.safeParse(postId).success) throw new AppError('NOT_FOUND');
  if (!on) {
    await getDb()
      .delete(townHallReactions)
      .where(and(eq(townHallReactions.postId, postId), eq(townHallReactions.userId, userId)));
    return { myReaction: null };
  }
  const loaded = await loadPost(userId, postId);
  if (!loaded || loaded.post.status !== 'published') throw new AppError('NOT_FOUND');
  if (loaded.post.authorId === userId) {
    throw new AppError('BAD_REQUEST', { message: 'You cannot react to your own post.' });
  }
  const db = getDb();
  const made = await db
    .insert(townHallReactions)
    .values({ postId, userId, kind })
    .onConflictDoNothing()
    .returning({ postId: townHallReactions.postId });
  if (made.length === 0) {
    await db
      .update(townHallReactions)
      .set({ kind })
      .where(and(eq(townHallReactions.postId, postId), eq(townHallReactions.userId, userId)));
  } else {
    emit({ type: 'hall.reaction_given', postId, postAuthorId: loaded.post.authorId, actorId: userId });
  }
  return { myReaction: kind };
}

/**
 * May `userId` take down something `authorId` wrote in this Town Hall? The writer always may (even after leaving); the
 * owner may take down anyone's; a Deputy only an ordinary member's or a former member's (ADR-041).
 */
async function mayTakeDown(userId: string, townHallId: string, authorId: string): Promise<boolean> {
  if (authorId === userId) return true;
  const role = await activeRole(userId, townHallId);
  if (!isStaff(role)) return false;
  return outranks(role, await activeRole(authorId, townHallId));
}

/**
 * Take a post down: its writer always may, and so may the Town Hall's staff (see `mayTakeDown`). Nobody else can, and
 * nobody else can tell whether the post exists. Its replies and reactions go with it.
 */
export async function removePost(userId: string, postId: string): Promise<void> {
  await enforceRateLimit(`townhalls:feed-manage:${userId}`, FEED_RATE.manage);
  if (!idParamSchema.safeParse(postId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb()
    .select({ authorId: townHallPosts.authorId, townHallId: townHallPosts.townHallId })
    .from(townHallPosts)
    .where(eq(townHallPosts.id, postId))
    .limit(1);
  if (!row || !(await mayTakeDown(userId, row.townHallId, row.authorId))) throw new AppError('NOT_FOUND');
  await getDb().delete(townHallPosts).where(eq(townHallPosts.id, postId));
}

export async function removeReply(userId: string, replyId: string): Promise<void> {
  await enforceRateLimit(`townhalls:feed-manage:${userId}`, FEED_RATE.manage);
  if (!idParamSchema.safeParse(replyId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb()
    .select({ authorId: townHallReplies.authorId, townHallId: townHallPosts.townHallId })
    .from(townHallReplies)
    .innerJoin(townHallPosts, eq(townHallPosts.id, townHallReplies.postId))
    .where(eq(townHallReplies.id, replyId))
    .limit(1);
  if (!row || !(await mayTakeDown(userId, row.townHallId, row.authorId))) throw new AppError('NOT_FOUND');
  await getDb().delete(townHallReplies).where(eq(townHallReplies.id, replyId));
}

/** Is `userId` on this Town Hall's staff (owner or Deputy, active)? */
const onStaff = async (userId: string, townHallId: string) => isStaff(await activeRole(userId, townHallId));

/**
 * Let a held post through. Owner or Deputy. Approval bumps it to "now" so members already past that spot still see it.
 * No Chime goes to the writer: they were never told it was held.
 */
export async function approvePost(staffId: string, postId: string): Promise<void> {
  await enforceRateLimit(`townhalls:feed-manage:${staffId}`, FEED_RATE.manage);
  if (!idParamSchema.safeParse(postId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb()
    .select({ status: townHallPosts.status, townHallId: townHallPosts.townHallId })
    .from(townHallPosts)
    .where(eq(townHallPosts.id, postId))
    .limit(1);
  if (!row || !(await onStaff(staffId, row.townHallId))) throw new AppError('NOT_FOUND');
  // Already published is a harmless repeat.
  await getDb()
    .update(townHallPosts)
    .set({ status: 'published', createdAt: new Date() })
    .where(and(eq(townHallPosts.id, postId), eq(townHallPosts.status, 'held')));
}

export async function approveReply(staffId: string, replyId: string): Promise<void> {
  await enforceRateLimit(`townhalls:feed-manage:${staffId}`, FEED_RATE.manage);
  if (!idParamSchema.safeParse(replyId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb()
    .select({
      status: townHallReplies.status,
      postId: townHallReplies.postId,
      townHallId: townHallPosts.townHallId,
    })
    .from(townHallReplies)
    .innerJoin(townHallPosts, eq(townHallPosts.id, townHallReplies.postId))
    .where(eq(townHallReplies.id, replyId))
    .limit(1);
  if (!row || !(await onStaff(staffId, row.townHallId))) throw new AppError('NOT_FOUND');
  if (row.status === 'published') return;
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select 1 from ${townHallPosts} where ${townHallPosts.id} = ${row.postId} for update`,
    );
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(townHallReplies)
      .where(and(eq(townHallReplies.postId, row.postId), eq(townHallReplies.status, 'published')));
    if (n >= REPLIES_PER_CARD) throw new AppError('CONFLICT', { message: 'That post is full.' });
    await tx
      .update(townHallReplies)
      .set({ status: 'published', createdAt: new Date() })
      .where(eq(townHallReplies.id, replyId));
  });
}

/**
 * What is held for the staff's OK in one Town Hall. Owner or Deputy only (anyone else: null). People the viewer hid,
 * and inactive accounts, are left out — as on the Fence.
 */
export async function listHeld(staffId: string, townHallId: string): Promise<HeldItems | null> {
  await enforceRateLimit(`townhalls:feed-manage:${staffId}`, FEED_RATE.manage);
  const hall = await hallForMember(staffId, townHallId);
  if (!hall || !isStaff(hall.myRole)) return null;
  const db = getDb();
  const [posts, replies] = await Promise.all([
    db
      .select()
      .from(townHallPosts)
      .where(and(eq(townHallPosts.townHallId, hall.id), eq(townHallPosts.status, 'held')))
      .orderBy(desc(townHallPosts.createdAt), desc(townHallPosts.id))
      .limit(HELD_LIMIT),
    db
      .select({ reply: townHallReplies, postBody: townHallPosts.body })
      .from(townHallReplies)
      .innerJoin(townHallPosts, eq(townHallPosts.id, townHallReplies.postId))
      .where(and(eq(townHallPosts.townHallId, hall.id), eq(townHallReplies.status, 'held')))
      .orderBy(desc(townHallReplies.createdAt), desc(townHallReplies.id))
      .limit(HELD_LIMIT),
  ]);
  const ids = [...posts.map((p) => p.authorId), ...replies.map((r) => r.reply.authorId)];
  const [authors, hidden] = await Promise.all([getCards(ids), hiddenAuthors(staffId, ids)]);
  const ok = (id: string) => authors.has(id) && !hidden.has(id);
  return {
    posts: posts
      .filter((p) => ok(p.authorId))
      .map((p) => ({
        id: p.id,
        body: p.body,
        createdAt: p.createdAt,
        author: toAuthor(authors.get(p.authorId)!),
      })),
    replies: replies
      .filter((r) => ok(r.reply.authorId))
      .map((r) => ({
        id: r.reply.id,
        body: r.reply.body,
        createdAt: r.reply.createdAt,
        author: toAuthor(authors.get(r.reply.authorId)!),
        onPost: r.postBody,
      })),
  };
}

/** A post the reader may see, in the shape a report needs (the writer and its words). Null otherwise. */
export async function hallPostForReport(
  userId: string,
  postId: string,
): Promise<{ id: string; authorId: string; body: string } | null> {
  const loaded = await loadPost(userId, postId);
  return loaded ? { id: loaded.post.id, authorId: loaded.post.authorId, body: loaded.post.body } : null;
}

/** Retention: drop held posts and replies nobody answered for 30 days. Returns how many rows were removed. */
export async function purgeStaleHeld(now: Date = new Date()): Promise<{ posts: number; replies: number }> {
  const cutoff = new Date(now.getTime() - HELD_RETENTION_MS);
  const db = getDb();
  const replies = await db
    .delete(townHallReplies)
    .where(and(eq(townHallReplies.status, 'held'), lt(townHallReplies.createdAt, cutoff)))
    .returning({ id: townHallReplies.id });
  const posts = await db
    .delete(townHallPosts)
    .where(and(eq(townHallPosts.status, 'held'), lt(townHallPosts.createdAt, cutoff)))
    .returning({ id: townHallPosts.id });
  return { posts: posts.length, replies: replies.length };
}
