import {
  media,
  townHallAskAnswers,
  townHallAsks,
  townHallEvents,
  townHallMembers,
  townHallPollOptions,
  townHallPollVotes,
  townHallPolls,
  townHallPosts,
  townHallReactions,
  townHallReplies,
  townHallRsvps,
  townHalls,
  users,
} from '@db/schema';
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { ASK_RATE, askDailyKey } from '@/modules/asks';
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
import { leadingMention } from '@/shared/mentions';
import type { PortraitTint } from '@/shared/validation/profile';
import {
  ASK_OUTCOMES,
  ASK_VERDICTS,
  HALL_FEED_MAX_PAGE_SIZE,
  HALL_FEED_PAGE_SIZE,
  RSVP_ANSWERS,
  type AskOutcome,
  type AskVerdict,
  type RsvpAnswer,
} from '@/shared/validation/town-halls';
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

/** A photo can be posted only while it is younger than this (the clean-up job takes unattached ones at 60 minutes). */
const PHOTO_ATTACH_WINDOW_MS = 55 * 60_000;

/** One photo on a post (ADR-046), served by /api/hall-posts/:id/photo to exactly who may see the post. */
export interface HallPhoto {
  url: string;
  width: number;
  height: number;
}

/** A photo the photo check held (ADR-039) is shown to its owner only, until a moderator decides. */
const photoShownTo = (viewerId: string) => or(eq(media.held, false), eq(media.ownerId, viewerId));

/** The live photos on these posts that this viewer may see, by post id. */
async function photosOn(viewerId: string, postIds: string[]): Promise<Map<string, HallPhoto>> {
  if (postIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: media.id, postId: media.hallPostId, width: media.width, height: media.height })
    .from(media)
    .where(
      and(
        inArray(media.hallPostId, postIds),
        eq(media.kind, 'card_photo'),
        eq(media.status, 'ready'),
        photoShownTo(viewerId),
      ),
    );
  return new Map(
    rows.map((r) => [
      r.postId!,
      { url: `/api/hall-posts/${r.postId}/photo?v=${r.id}`, width: r.width ?? 0, height: r.height ?? 0 },
    ]),
  );
}

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

/** A group event as one member sees it (ADR-056). */
export interface HallEventView {
  title: string;
  startsAt: Date;
  place: string | null;
  /** How many current members answered each way. Numbers for everyone. */
  counts: Record<RsvpAnswer, number>;
  /** My own answer, if any. */
  mine: RsvpAnswer | null;
  /** It has started: answers are closed. */
  closed: boolean;
  /** Who answered what: for the organiser (the post's writer) alone; null for everyone else. */
  answers: Record<RsvpAnswer, HallAuthor[]> | null;
}

/** A group poll as one member sees it (ADR-057). Counts only, ever: nobody is shown who voted what. */
export interface HallPollView {
  options: { id: string; label: string; votes: number }[];
  /** Votes from current members, all options together. */
  total: number;
  /** The option I voted for, if any. */
  mine: string | null;
  /** Closed: final results, no more voting. */
  closed: boolean;
  /** May I close it (whoever asked, the owner or a Deputy), while it is open? */
  canClose: boolean;
}

/** One member's answer to a "Buy or wait?" (ADR-065). */
export interface HallAskAnswer {
  author: HallAuthor;
  verdict: AskVerdict;
  reason: string;
  mine: boolean;
}

/** A "Buy or wait?" as one member sees it (ADR-065). Its words (why the asker wants it) are the post's body. */
export interface HallAskView {
  item: string;
  priceRupees: number;
  alternative: string | null;
  /** The asker's one update, if they added it. */
  note: string | null;
  /** What the asker decided; answers are closed once set. */
  outcome: AskOutcome | null;
  counts: Record<AskVerdict, number>;
  /** Every answer from a current member this viewer has not hidden, oldest first. */
  answers: HallAskAnswer[];
  /** My own answer, if any. */
  mine: { verdict: AskVerdict; reason: string } | null;
  /** May I answer (a member who is not the asker, on a published, undecided question)? */
  canAnswer: boolean;
  /** Am I the asker? (Then I may add my one update and say what I decided.) */
  isAsker: boolean;
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
  /** May this viewer pin it to the top of the feed (the owner or a Deputy, a published post)? */
  canPin: boolean;
  /** When this post is an event (ADR-056): its details and answers. */
  event: HallEventView | null;
  /** When this post is a poll (ADR-057): its options and counts. */
  poll: HallPollView | null;
  /** When this post is a "Buy or wait?" (ADR-065). */
  ask: HallAskView | null;
  /** Its photo (ADR-046), when it has one this viewer may see. */
  photo: HallPhoto | null;
  /** Set when this post is a Time Capsule that opened (ADR-043): when its words were sealed. */
  capsuleSealedAt: Date | null;
  /** Count per kind, always present even at zero. Never who gave which. */
  reactions: Record<ReactionKind, number>;
  myReaction: ReactionKind | null;
  replies: HallReplyView[];
}

export interface HallFeedPage {
  /** The pinned notice, on the first page only, when there is one this viewer may see; never repeated in `posts`. */
  pinned: HallPostView | null;
  posts: HallPostView[];
  nextCursor: string | null;
}

export interface HeldPost {
  id: string;
  body: string;
  createdAt: Date;
  author: HallAuthor;
  /** Staff see a held post's photo to judge it — unless the photo check itself is holding the photo. */
  photo: HallPhoto | null;
}
export interface HeldReply extends Omit<HeldPost, 'photo'> {
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
  /** The post pinned to the top of the feed, if any. */
  pinnedPostId: string | null;
}

/** The Town Hall, when this person is an active member of it; null otherwise (hidden ≡ missing). */
async function hallForMember(userId: string, townHallId: string): Promise<Hall | null> {
  if (!idParamSchema.safeParse(townHallId).success) return null;
  const [row] = await getDb()
    .select({
      id: townHalls.id,
      ownerId: townHalls.ownerId,
      myRole: sql<HallRole>`${townHallMembers.role}`,
      pinnedPostId: townHalls.pinnedPostId,
    })
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
  capsuleSealedAt: Date | null;
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
  const [counts, mine, replyRows, photos, events, polls, asks] = await Promise.all([
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
    photosOn(viewerId, ids),
    eventsOn(viewerId, hall.id, rows),
    pollsOn(viewerId, hall, rows),
    asksOn(viewerId, hall, rows),
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
        canReact: published, // your own too (2026-11-07); nobody is notified of their own Star
        canReply: published,
        canPin: published && isStaff(hall.myRole),
        event: events.get(row.id) ?? null,
        poll: polls.get(row.id) ?? null,
        ask: asks.get(row.id) ?? null,
        photo: photos.get(row.id) ?? null,
        capsuleSealedAt: row.capsuleSealedAt,
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
          // The pinned notice has its own place at the top; it is not repeated in the list.
          hall.pinnedPostId ? ne(townHallPosts.id, hall.pinnedPostId) : undefined,
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

  const [posts, pinned] = await Promise.all([
    hydrate(viewerId, hall, kept, keptAuthors),
    cursor ? Promise.resolve(null) : pinnedFor(viewerId, hall),
  ]);
  return { pinned, posts, nextCursor: next ? encodeCursor(next) : null };
}

/**
 * The pinned notice as this member sees it, or null: a published post whose writer is active and not hidden from them
 * (the same rules as any post in the list).
 */
async function pinnedFor(viewerId: string, hall: Hall): Promise<HallPostView | null> {
  if (!hall.pinnedPostId) return null;
  const [row] = await getDb()
    .select()
    .from(townHallPosts)
    .where(and(eq(townHallPosts.id, hall.pinnedPostId), eq(townHallPosts.status, 'published')))
    .limit(1);
  if (!row) return null;
  const [authors, hidden] = await Promise.all([
    getCards([row.authorId]),
    hiddenAuthors(viewerId, [row.authorId]),
  ]);
  if (hidden.has(row.authorId) || !authors.has(row.authorId)) return null;
  const [view] = await hydrate(viewerId, hall, [row], authors);
  return view ?? null;
}

/**
 * Pin a post to the top of its Town Hall's feed (a pinned notice), replacing any pinned before. The owner or a Deputy,
 * and only a published post; to anyone else, or for a held post, the same 404 as a post that is not there. Quiet: nobody
 * is told.
 */
export async function pinPost(staffId: string, postId: string): Promise<void> {
  await enforceRateLimit(`townhalls:feed-manage:${staffId}`, FEED_RATE.manage);
  if (!idParamSchema.safeParse(postId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb()
    .select({ status: townHallPosts.status, townHallId: townHallPosts.townHallId })
    .from(townHallPosts)
    .where(eq(townHallPosts.id, postId))
    .limit(1);
  if (!row || row.status !== 'published' || !(await onStaff(staffId, row.townHallId))) {
    throw new AppError('NOT_FOUND');
  }
  await getDb().update(townHalls).set({ pinnedPostId: postId }).where(eq(townHalls.id, row.townHallId));
}

/** Unpin it (only if it is still the pinned one: a stale tab never unpins a newer notice). The owner or a Deputy. */
export async function unpinPost(staffId: string, postId: string): Promise<void> {
  await enforceRateLimit(`townhalls:feed-manage:${staffId}`, FEED_RATE.manage);
  if (!idParamSchema.safeParse(postId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb()
    .select({ townHallId: townHallPosts.townHallId })
    .from(townHallPosts)
    .where(eq(townHallPosts.id, postId))
    .limit(1);
  if (!row || !(await onStaff(staffId, row.townHallId))) throw new AppError('NOT_FOUND');
  await getDb()
    .update(townHalls)
    .set({ pinnedPostId: null })
    .where(and(eq(townHalls.id, row.townHallId), eq(townHalls.pinnedPostId, postId)));
}

/**
 * Staff's own words are never held (they would only be letting themselves through); anyone else's are when enough
 * people have reported them lately (ADR-024). `hall` is the AUTHOR's own view of it.
 */
async function statusFor(hall: Hall, authorId: string): Promise<'published' | 'held'> {
  if (isStaff(hall.myRole)) return 'published';
  return (await shouldHoldForOthers(authorId)) ? 'held' : 'published';
}

/**
 * Post to a Town Hall's feed. Active members only. With `photoId`, one of my finished photos goes with it (ADR-046) —
 * the same photo pipeline and check as a Post Card's, attached in the same transaction or not at all.
 */
export async function createPost(
  userId: string,
  townHallId: string,
  body: string,
  photoId?: string,
  /** Makes the post an event (ADR-056): written with it, in the same transaction, or not at all. */
  event?: { title: string; startsAt: Date; place?: string | undefined },
  /** Makes the post a poll (ADR-057): its options, written with it in the same transaction. */
  poll?: { options: string[] },
  /** Makes the post a "Buy or wait?" (ADR-065), written with it in the same transaction. */
  ask?: { item: string; priceRupees: number; alternative?: string | undefined },
): Promise<HallPostView> {
  // Spent before the Town Hall is looked up: the same limit trips whether it exists, is hidden or is made up.
  await enforceRateLimit(`townhalls:post:${userId}`, FEED_RATE.post);
  await enforceNewAccountLimit(userId, 'card');
  const hall = await hallForMember(userId, townHallId);
  if (!hall) throw new AppError('NOT_FOUND');
  await enforceRateLimit(`townhalls:post:${userId}:${hall.id}`, FEED_RATE.postPerHall);
  const status = await statusFor(hall, userId);
  const row = await getDb().transaction(async (tx) => {
    // Written with millisecond precision so cursors compare exactly (see cursor.ts).
    const [post] = await tx
      .insert(townHallPosts)
      .values({ townHallId: hall.id, authorId: userId, body, status, createdAt: new Date() })
      .returning();
    if (event) {
      await tx.insert(townHallEvents).values({
        postId: post!.id,
        title: event.title,
        startsAt: event.startsAt,
        place: event.place ?? null,
      });
    }
    if (poll) {
      await tx.insert(townHallPolls).values({ postId: post!.id });
      await tx
        .insert(townHallPollOptions)
        .values(poll.options.map((label, position) => ({ postId: post!.id, position, label })));
    }
    if (ask) {
      await tx.insert(townHallAsks).values({
        postId: post!.id,
        item: ask.item,
        priceRupees: ask.priceRupees,
        alternative: ask.alternative ?? null,
      });
    }
    if (photoId) {
      // Only MY finished photo, on no card and no other post yet, and young enough that the clean-up cannot take it.
      const attached = await tx
        .update(media)
        .set({ hallPostId: post!.id, updatedAt: sql`now()` })
        .where(
          and(
            eq(media.id, photoId),
            eq(media.ownerId, userId),
            eq(media.kind, 'card_photo'),
            eq(media.status, 'ready'),
            isNull(media.cardId),
            isNull(media.hallPostId),
            isNull(media.storyId),
            gt(media.createdAt, new Date(Date.now() - PHOTO_ATTACH_WINDOW_MS)),
          ),
        )
        .returning({ id: media.id });
      if (attached.length === 0) {
        throw new AppError('VALIDATION_FAILED', {
          message: 'That photo is no longer available. Add it again.',
          fields: { photo: 'That photo is no longer available. Add it again.' },
        });
      }
    }
    return post!;
  });
  const [view] = await hydrate(userId, hall, [row], await getCards([userId]));
  if (!view) throw new AppError('INTERNAL');
  return view;
}

/**
 * Who a reply answers: the person whose "@handle" it starts with, but only if they already replied on this post (the same
 * rule as on walls). Typing anyone else's handle tells nobody, so a reply cannot ping strangers or non-members.
 */
async function mentionedReplier(postId: string, body: string): Promise<string | undefined> {
  const handle = leadingMention(body);
  if (!handle) return undefined;
  const [row] = await getDb()
    .select({ id: townHallReplies.authorId })
    .from(townHallReplies)
    .innerJoin(users, eq(users.id, townHallReplies.authorId))
    .where(
      and(
        eq(townHallReplies.postId, postId),
        eq(townHallReplies.status, 'published'),
        eq(users.handle, handle),
      ),
    )
    .limit(1);
  return row?.id;
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
    emit({
      type: 'hall.reply_created',
      postId: post.id,
      postAuthorId: post.authorId,
      authorId: userId,
      mentionedId: await mentionedReplier(post.id, body),
    });
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
  const [authors, hidden, photos] = await Promise.all([
    getCards(ids),
    hiddenAuthors(staffId, ids),
    photosOn(
      staffId,
      posts.map((p) => p.id),
    ),
  ]);
  const ok = (id: string) => authors.has(id) && !hidden.has(id);
  return {
    posts: posts
      .filter((p) => ok(p.authorId))
      .map((p) => ({
        id: p.id,
        body: p.body,
        createdAt: p.createdAt,
        author: toAuthor(authors.get(p.authorId)!),
        photo: photos.get(p.id) ?? null,
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

/**
 * The photo on a post, for exactly who may see the post (ADR-046): an active member, the post published (or their own,
 * or they are staff), its writer not hidden from them — and the photo not held by the photo check unless it is theirs.
 * Missing, hidden and "no photo" are all null.
 */
export async function hallPostPhotoFor(viewerId: string, postId: string): Promise<string | null> {
  const loaded = await loadPost(viewerId, postId);
  if (!loaded) return null;
  const [photo] = await getDb()
    .select({ id: media.id })
    .from(media)
    .where(
      and(
        eq(media.hallPostId, loaded.post.id),
        eq(media.kind, 'card_photo'),
        eq(media.status, 'ready'),
        photoShownTo(viewerId),
      ),
    )
    .limit(1);
  return photo?.id ?? null;
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

const emptyAnswers = <T>(make: () => T): Record<RsvpAnswer, T> =>
  Object.fromEntries(RSVP_ANSWERS.map((a) => [a, make()])) as Record<RsvpAnswer, T>;
const isAnswer = (a: string): a is RsvpAnswer => (RSVP_ANSWERS as readonly string[]).includes(a);

/**
 * The events among these posts, as this viewer sees them (ADR-056). Only answers from people who are still active
 * members count (decided now, not when they answered). The names go to the organiser alone, without anyone they have
 * hidden or any account that is no longer active.
 */
async function eventsOn(
  viewerId: string,
  hallId: string,
  rows: PostRow[],
): Promise<Map<string, HallEventView>> {
  const ids = rows.map((r) => r.id);
  const out = new Map<string, HallEventView>();
  if (ids.length === 0) return out;
  const db = getDb();
  const events = await db.select().from(townHallEvents).where(inArray(townHallEvents.postId, ids));
  if (events.length === 0) return out;
  const answers = await db
    .select({ postId: townHallRsvps.postId, userId: townHallRsvps.userId, answer: townHallRsvps.answer })
    .from(townHallRsvps)
    .innerJoin(
      townHallMembers,
      and(
        eq(townHallMembers.townHallId, hallId),
        eq(townHallMembers.userId, townHallRsvps.userId),
        eq(townHallMembers.status, 'active'),
      ),
    )
    .where(
      inArray(
        townHallRsvps.postId,
        events.map((e) => e.postId),
      ),
    )
    .orderBy(asc(townHallRsvps.answeredAt));
  const writerOf = new Map(rows.map((r) => [r.id, r.authorId]));
  const organised = events.filter((e) => writerOf.get(e.postId) === viewerId).map((e) => e.postId);
  const nameIds = [...new Set(answers.filter((a) => organised.includes(a.postId)).map((a) => a.userId))];
  const [cards, hidden] = nameIds.length
    ? await Promise.all([getCards(nameIds), hiddenAuthors(viewerId, nameIds)])
    : [new Map<string, PersonCard>(), new Set<string>()];
  const now = Date.now();
  for (const e of events) {
    const mineHere = organised.includes(e.postId);
    const view: HallEventView = {
      title: e.title,
      startsAt: e.startsAt,
      place: e.place,
      counts: emptyAnswers(() => 0),
      mine: null,
      closed: e.startsAt.getTime() <= now,
      answers: mineHere ? emptyAnswers<HallAuthor[]>(() => []) : null,
    };
    for (const a of answers) {
      if (a.postId !== e.postId || !isAnswer(a.answer)) continue;
      view.counts[a.answer] += 1;
      if (a.userId === viewerId) view.mine = a.answer;
      const card = cards.get(a.userId);
      if (view.answers && card && !hidden.has(a.userId)) view.answers[a.answer].push(toAuthor(card));
    }
    out.set(e.postId, view);
  }
  return out;
}

/**
 * Answer a group event (ADR-056): going, maybe or can't go, or `null` to take the answer back. Active members who may
 * see the post only (anyone else, or a post that is not an event, gets the same 404), on a published event that has not
 * started yet. Nobody is told; the organiser sees the names next time they look.
 */
export async function answerEvent(userId: string, postId: string, answer: RsvpAnswer | null): Promise<void> {
  await enforceRateLimit(`townhalls:rsvp:${userId}`, FEED_RATE.react);
  const found = await loadPost(userId, postId);
  if (!found || found.post.status !== 'published') throw new AppError('NOT_FOUND');
  const [event] = await getDb()
    .select({ startsAt: townHallEvents.startsAt })
    .from(townHallEvents)
    .where(eq(townHallEvents.postId, postId))
    .limit(1);
  if (!event) throw new AppError('NOT_FOUND');
  if (event.startsAt.getTime() <= Date.now()) {
    throw new AppError('BAD_REQUEST', { message: 'This event has started, so answers are closed.' });
  }
  if (answer === null) {
    await getDb()
      .delete(townHallRsvps)
      .where(and(eq(townHallRsvps.postId, postId), eq(townHallRsvps.userId, userId)));
    return;
  }
  await getDb()
    .insert(townHallRsvps)
    .values({ postId, userId, answer, answeredAt: new Date() })
    .onConflictDoUpdate({
      target: [townHallRsvps.postId, townHallRsvps.userId],
      set: { answer, answeredAt: new Date() },
    });
}

/** Everyone a page of posts shows: writers, repliers and (for an organiser) who answered their events. For photos. */
export const peopleOn = (posts: HallPostView[]): HallAuthor[] =>
  posts.flatMap((p) => [
    p.author,
    ...p.replies.map((r) => r.author),
    ...(p.ask ? p.ask.answers.map((a) => a.author) : []),
    ...(p.event?.answers ? RSVP_ANSWERS.flatMap((a) => p.event!.answers![a]) : []),
  ]);

/**
 * The polls among these posts, as this viewer sees them (ADR-057): options in order, how many current active members
 * chose each (decided now), and my own vote. Never who voted what.
 */
async function pollsOn(viewerId: string, hall: Hall, rows: PostRow[]): Promise<Map<string, HallPollView>> {
  const out = new Map<string, HallPollView>();
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return out;
  const db = getDb();
  const polls = await db.select().from(townHallPolls).where(inArray(townHallPolls.postId, ids));
  if (polls.length === 0) return out;
  const pollIds = polls.map((p) => p.postId);
  const [options, votes] = await Promise.all([
    db
      .select()
      .from(townHallPollOptions)
      .where(inArray(townHallPollOptions.postId, pollIds))
      .orderBy(asc(townHallPollOptions.position)),
    db
      .select({
        postId: townHallPollVotes.postId,
        userId: townHallPollVotes.userId,
        optionId: townHallPollVotes.optionId,
      })
      .from(townHallPollVotes)
      .innerJoin(
        townHallMembers,
        and(
          eq(townHallMembers.townHallId, hall.id),
          eq(townHallMembers.userId, townHallPollVotes.userId),
          eq(townHallMembers.status, 'active'),
        ),
      )
      .where(inArray(townHallPollVotes.postId, pollIds)),
  ]);
  const writerOf = new Map(rows.map((r) => [r.id, r.authorId]));
  for (const p of polls) {
    const mineHere = votes.find((v) => v.postId === p.postId && v.userId === viewerId);
    const opts = options
      .filter((o) => o.postId === p.postId)
      .map((o) => ({
        id: o.id,
        label: o.label,
        votes: votes.filter((v) => v.optionId === o.id).length,
      }));
    out.set(p.postId, {
      options: opts,
      total: opts.reduce((n, o) => n + o.votes, 0),
      mine: mineHere?.optionId ?? null,
      closed: p.closedAt !== null,
      canClose: p.closedAt === null && (writerOf.get(p.postId) === viewerId || isStaff(hall.myRole)),
    });
  }
  return out;
}

/**
 * Vote in a group poll (ADR-057): one of its own options, or `null` to take the vote back. Active members who may see
 * the post; anyone else, a post that is not a poll, or an option of another poll, gets the same 404. Not once closed.
 * Nobody is told, and nobody can ever see who voted what.
 */
export async function votePoll(userId: string, postId: string, optionId: string | null): Promise<void> {
  await enforceRateLimit(`townhalls:vote:${userId}`, FEED_RATE.react);
  const found = await loadPost(userId, postId);
  if (!found || found.post.status !== 'published') throw new AppError('NOT_FOUND');
  const [poll] = await getDb()
    .select({ closedAt: townHallPolls.closedAt })
    .from(townHallPolls)
    .where(eq(townHallPolls.postId, postId))
    .limit(1);
  if (!poll) throw new AppError('NOT_FOUND');
  if (poll.closedAt) throw new AppError('BAD_REQUEST', { message: 'This poll is closed.' });
  if (optionId === null) {
    await getDb()
      .delete(townHallPollVotes)
      .where(and(eq(townHallPollVotes.postId, postId), eq(townHallPollVotes.userId, userId)));
    return;
  }
  const [option] = await getDb()
    .select({ id: townHallPollOptions.id })
    .from(townHallPollOptions)
    .where(and(eq(townHallPollOptions.id, optionId), eq(townHallPollOptions.postId, postId)))
    .limit(1);
  if (!option) throw new AppError('NOT_FOUND');
  await getDb()
    .insert(townHallPollVotes)
    .values({ postId, userId, optionId, votedAt: new Date() })
    .onConflictDoUpdate({
      target: [townHallPollVotes.postId, townHallPollVotes.userId],
      set: { optionId, votedAt: new Date() },
    });
}

/**
 * Close a poll for good: final results, no more voting. Whoever asked it, or the owner or a Deputy; anyone else gets the
 * same 404 as a poll that is not there. Closing twice is a harmless repeat.
 */
export async function closePoll(userId: string, postId: string): Promise<void> {
  await enforceRateLimit(`townhalls:feed-manage:${userId}`, FEED_RATE.manage);
  const found = await loadPost(userId, postId);
  if (!found || (found.post.authorId !== userId && !isStaff(found.hall.myRole)))
    throw new AppError('NOT_FOUND');
  const closed = await getDb()
    .update(townHallPolls)
    .set({ closedAt: new Date() })
    .where(and(eq(townHallPolls.postId, postId), isNull(townHallPolls.closedAt)))
    .returning({ postId: townHallPolls.postId });
  if (closed.length === 0) {
    const [exists] = await getDb()
      .select({ postId: townHallPolls.postId })
      .from(townHallPolls)
      .where(eq(townHallPolls.postId, postId))
      .limit(1);
    if (!exists) throw new AppError('NOT_FOUND');
  }
}

// ─── "Buy or wait?" (ADR-065) ────────────────────────────────────────────────────────────────────────────────────────

const isVerdict = (v: string): v is AskVerdict => (ASK_VERDICTS as readonly string[]).includes(v);
const isOutcome = (v: string | null): v is AskOutcome =>
  v !== null && (ASK_OUTCOMES as readonly string[]).includes(v);

/**
 * The "Buy or wait?" questions among these posts, as this viewer sees them. Answers count only from people who are still
 * active members (decided now), and named answers leave out anyone the viewer has hidden or who is no longer active.
 */
async function asksOn(viewerId: string, hall: Hall, rows: PostRow[]): Promise<Map<string, HallAskView>> {
  const out = new Map<string, HallAskView>();
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return out;
  const db = getDb();
  const asks = await db.select().from(townHallAsks).where(inArray(townHallAsks.postId, ids));
  if (asks.length === 0) return out;
  const answers = await db
    .select({
      postId: townHallAskAnswers.postId,
      userId: townHallAskAnswers.userId,
      verdict: townHallAskAnswers.verdict,
      reason: townHallAskAnswers.reason,
    })
    .from(townHallAskAnswers)
    .innerJoin(
      townHallMembers,
      and(
        eq(townHallMembers.townHallId, hall.id),
        eq(townHallMembers.userId, townHallAskAnswers.userId),
        eq(townHallMembers.status, 'active'),
      ),
    )
    .where(
      inArray(
        townHallAskAnswers.postId,
        asks.map((a) => a.postId),
      ),
    )
    .orderBy(asc(townHallAskAnswers.answeredAt));
  const people = [...new Set(answers.map((a) => a.userId))];
  const [cards, hidden] = people.length
    ? await Promise.all([getCards(people), hiddenAuthors(viewerId, people)])
    : [new Map<string, PersonCard>(), new Set<string>()];
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const a of asks) {
    const row = byId.get(a.postId)!;
    const outcome = isOutcome(a.outcome) ? a.outcome : null;
    const view: HallAskView = {
      item: a.item,
      priceRupees: a.priceRupees,
      alternative: a.alternative,
      note: a.note,
      outcome,
      counts: { buy: 0, wait: 0 },
      answers: [],
      mine: null,
      canAnswer: row.authorId !== viewerId && row.status === 'published' && outcome === null,
      isAsker: row.authorId === viewerId,
    };
    for (const ans of answers) {
      if (ans.postId !== a.postId || !isVerdict(ans.verdict)) continue;
      const card = cards.get(ans.userId);
      if (!card) continue; // no longer active: their answer does not count
      view.counts[ans.verdict] += 1;
      const mineHere = ans.userId === viewerId;
      if (mineHere) view.mine = { verdict: ans.verdict, reason: ans.reason };
      if (!hidden.has(ans.userId)) {
        view.answers.push({
          author: toAuthor(card),
          verdict: ans.verdict,
          reason: ans.reason,
          mine: mineHere,
        });
      }
    }
    out.set(a.postId, view);
  }
  return out;
}

/**
 * Ask the group "Buy or wait?" (ADR-065). Any active member, a few a day (it rings every member). Follows every rule a
 * post does (limits, holding, the photo pipeline); a held one rings nobody.
 */
export async function createAsk(
  userId: string,
  townHallId: string,
  input: {
    item: string;
    price: number;
    why: string;
    alternative?: string | undefined;
    photoId?: string | undefined;
  },
): Promise<HallPostView> {
  // Three a day per person, shared with public questions (ADR-066).
  await enforceRateLimit(askDailyKey(userId), ASK_RATE.daily);
  const view = await createPost(userId, townHallId, input.why, input.photoId, undefined, undefined, {
    item: input.item,
    priceRupees: input.price,
    alternative: input.alternative,
  });
  const [row] = await getDb()
    .select({ status: townHallPosts.status, townHallId: townHallPosts.townHallId })
    .from(townHallPosts)
    .where(eq(townHallPosts.id, view.id))
    .limit(1);
  if (row?.status === 'published') {
    emit({ type: 'hall.ask_created', postId: view.id, townHallId: row.townHallId, authorId: userId });
  }
  return view;
}

/** The question and the post it is on, for someone who may see it; null otherwise. */
async function loadAsk(userId: string, postId: string) {
  const found = await loadPost(userId, postId);
  if (!found) return null;
  const [ask] = await getDb().select().from(townHallAsks).where(eq(townHallAsks.postId, postId)).limit(1);
  return ask ? { ...found, ask } : null;
}

/** The question as this viewer sees it now, after a change (what the routes send back). */
async function askViewOf(userId: string, found: { post: PostRow; hall: Hall }): Promise<HallAskView> {
  const view = (await asksOn(userId, found.hall, [found.post])).get(found.post.id);
  if (!view) throw new AppError('NOT_FOUND');
  return view;
}

/**
 * Answer "Buy or wait?": buy or wait with a reason, or `null` to take the answer back. Active members who may see the
 * post, not the asker, while it is undecided. Anyone else, or a post that is not a question, gets the same 404. Only a
 * first answer rings the asker (a changed one is not news).
 */
export async function answerAsk(
  userId: string,
  postId: string,
  answer: { verdict: AskVerdict; reason: string } | null,
): Promise<HallAskView> {
  await enforceRateLimit(`townhalls:ask-answer:${userId}`, FEED_RATE.react);
  await enforceNewAccountLimit(userId, 'reply');
  const found = await loadAsk(userId, postId);
  if (!found || found.post.status !== 'published') throw new AppError('NOT_FOUND');
  if (answer === null) {
    await getDb()
      .delete(townHallAskAnswers)
      .where(and(eq(townHallAskAnswers.postId, postId), eq(townHallAskAnswers.userId, userId)));
    return askViewOf(userId, found);
  }
  if (found.post.authorId === userId) {
    throw new AppError('BAD_REQUEST', { message: 'This is your own question. Your group answers it.' });
  }
  if (found.ask.outcome !== null) {
    throw new AppError('BAD_REQUEST', { message: 'They have already decided, so answers are closed.' });
  }
  const db = getDb();
  const made = await db
    .insert(townHallAskAnswers)
    .values({ postId, userId, verdict: answer.verdict, reason: answer.reason, answeredAt: new Date() })
    .onConflictDoNothing()
    .returning({ postId: townHallAskAnswers.postId });
  if (made.length === 0) {
    await db
      .update(townHallAskAnswers)
      .set({ verdict: answer.verdict, reason: answer.reason, answeredAt: new Date() })
      .where(and(eq(townHallAskAnswers.postId, postId), eq(townHallAskAnswers.userId, userId)));
    return askViewOf(userId, found);
  }
  emit({ type: 'hall.ask_answered', postId, postAuthorId: found.post.authorId, actorId: userId });
  return askViewOf(userId, found);
}

/**
 * The asker's ONE update (to answer what the group asked). Not a chat: a second one is refused. The asker only; anyone
 * else gets the same 404 as a question that is not there.
 */
export async function noteAsk(userId: string, postId: string, note: string): Promise<HallAskView> {
  await enforceRateLimit(`townhalls:feed-manage:${userId}`, FEED_RATE.manage);
  const found = await loadAsk(userId, postId);
  if (!found || found.post.authorId !== userId) throw new AppError('NOT_FOUND');
  const done = await getDb()
    .update(townHallAsks)
    .set({ note, notedAt: new Date() })
    .where(and(eq(townHallAsks.postId, postId), isNull(townHallAsks.note)))
    .returning({ postId: townHallAsks.postId });
  if (done.length === 0)
    throw new AppError('CONFLICT', { message: 'You have already added your one update.' });
  return askViewOf(userId, found);
}

/**
 * Say what you decided: bought it, waiting, or skipped it. Answers close. The asker may change it later (waiting, then
 * bought); anyone else gets the same 404 as a question that is not there.
 */
export async function decideAsk(userId: string, postId: string, outcome: AskOutcome): Promise<HallAskView> {
  await enforceRateLimit(`townhalls:feed-manage:${userId}`, FEED_RATE.manage);
  const found = await loadAsk(userId, postId);
  if (!found || found.post.authorId !== userId) throw new AppError('NOT_FOUND');
  await getDb()
    .update(townHallAsks)
    .set({ outcome, decidedAt: new Date() })
    .where(eq(townHallAsks.postId, postId));
  return askViewOf(userId, found);
}
