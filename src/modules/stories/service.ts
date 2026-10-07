import { media, stories, storyReactions, storyViews } from '@db/schema';
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { enforceNewAccountLimit } from '@/modules/moderation';
import { getCards, resolveHandle, sharingStoryViews, type PersonCard } from '@/modules/profiles';
import { hiddenAuthors, limitedAmong, palsReaching } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import { REACTION_KINDS, idParamSchema, type ReactionKind } from '@/shared/validation/fence';
import type { PortraitTint } from '@/shared/validation/profile';
import type { PostStoryInput, StoryAudience } from '@/shared/validation/stories';

/**
 * Stories (ADR-047): one photo, an optional short caption, seen by my Pals — or only my Close Pals — for 12 hours.
 * - Who sees one is decided when it is read (`palsReaching`, like the Porch Light): a Pal now, no block either way, not
 *   restricted by the author, not muting them, and for a Close-only Story someone the author marked Close now.
 * - Past its 12 hours a Story is gone everywhere; the daily job deletes it and its photo.
 * - Views are recorded so each person's own "seen" rings work; the author sees WHO viewed only when both the author
 *   and that viewer share Story views (reciprocal, like "Seen" on Whispers). Reactions are always shown to the author.
 * - The photo goes through the same pipeline and check as a Post Card photo; a held photo is seen by its owner only.
 */

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
export const STORY_RATE = {
  post: rule(20, 86_400),
  read: rule(240, 60),
  react: rule(200, 3600),
  manage: rule(60, 3600),
} as const;

export const STORY_TTL_MS = 12 * 60 * 60 * 1000;
/** Live Stories one person may have at once. */
export const MAX_LIVE_STORIES = 10;
/** A photo can be used only while it is younger than this (the clean-up takes unattached ones at 60 minutes). */
const PHOTO_ATTACH_WINDOW_MS = 55 * 60_000;

type Person = { handle: string; displayName: string; portraitTint: PortraitTint; portraitUrl?: string };
const personOf = (c: PersonCard): Person => ({
  handle: c.handle,
  displayName: c.displayName,
  portraitTint: c.portraitTint,
});

export interface StoryPhoto {
  url: string;
  width: number;
  height: number;
}

export interface StoryViewer {
  person: Person;
  reaction: ReactionKind | null;
}

export interface StoryItem {
  id: string;
  caption: string | null;
  photo: StoryPhoto;
  postedAt: string;
  expiresAt: string;
  mine: boolean;
  myReaction: ReactionKind | null;
  /** Mine only (null for anyone else's): who it is for. */
  audience: StoryAudience | null;
  /** Mine only, and only when I share my Story views: who viewed (and how they reacted). Null otherwise. */
  viewers: StoryViewer[] | null;
  /** Mine only: reactions from people not in `viewers` (e.g. they do not share views). */
  reactions: StoryViewer[] | null;
}

export interface StoryRingItem {
  person: Person;
  mine: boolean;
  /** Any live Story of theirs I have not opened yet. */
  unseen: boolean;
  count: number;
  latestAt: string;
}

const isKind = (k: string): k is ReactionKind => (REACTION_KINDS as readonly string[]).includes(k);

interface LiveRow {
  id: string;
  authorId: string;
  audience: string;
  caption: string | null;
  createdAt: Date;
  expiresAt: Date;
  mediaId: string;
  width: number | null;
  height: number | null;
}

/**
 * Live Stories by these authors that `viewerId` may see, oldest first: their photo is ready (and, if the photo check
 * holds it, they are its owner), and for someone else's Story the reach rule above holds.
 */
async function visibleStories(viewerId: string, authorIds: string[], now: Date): Promise<LiveRow[]> {
  const others = authorIds.filter((id) => id !== viewerId);
  const reach = others.length ? await palsReaching(viewerId, others) : new Map();
  const allowed = [...new Set([...(authorIds.includes(viewerId) ? [viewerId] : []), ...reach.keys()])];
  if (allowed.length === 0) return [];
  const rows: LiveRow[] = await getDb()
    .select({
      id: stories.id,
      authorId: stories.authorId,
      audience: stories.audience,
      caption: stories.caption,
      createdAt: stories.createdAt,
      expiresAt: stories.expiresAt,
      mediaId: media.id,
      width: media.width,
      height: media.height,
    })
    .from(stories)
    .innerJoin(
      media,
      and(
        eq(media.storyId, stories.id),
        eq(media.kind, 'card_photo'),
        eq(media.status, 'ready'),
        or(eq(media.held, false), eq(media.ownerId, viewerId)),
      ),
    )
    .where(and(inArray(stories.authorId, allowed), gt(stories.expiresAt, now)))
    .orderBy(asc(stories.createdAt), asc(stories.id));
  const cards = await getCards([...new Set(rows.map((r) => r.authorId))]);
  return rows.filter(
    (r) =>
      cards.has(r.authorId) &&
      (r.authorId === viewerId || r.audience === 'pals' || reach.get(r.authorId)?.marksMeClose === true),
  );
}

/** One live Story `viewerId` may see, or null (expired, not for them, made up). */
async function visibleStory(viewerId: string, storyId: string, now: Date): Promise<LiveRow | null> {
  if (!idParamSchema.safeParse(storyId).success) return null;
  const [row] = await getDb()
    .select({ authorId: stories.authorId })
    .from(stories)
    .where(eq(stories.id, storyId))
    .limit(1);
  if (!row) return null;
  return (await visibleStories(viewerId, [row.authorId], now)).find((s) => s.id === storyId) ?? null;
}

// ─── posting ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Post a Story: one of my finished photos, attached in the same transaction or not at all. */
export async function postStory(
  userId: string,
  input: PostStoryInput,
  now: Date = new Date(),
): Promise<{ id: string; expiresAt: string }> {
  await enforceRateLimit(`stories:post:${userId}`, STORY_RATE.post);
  await enforceNewAccountLimit(userId, 'card');
  const [{ n } = { n: 0 }] = await getDb()
    .select({ n: count() })
    .from(stories)
    .where(and(eq(stories.authorId, userId), gt(stories.expiresAt, now)));
  if (n >= MAX_LIVE_STORIES) {
    throw new AppError('CONFLICT', { message: `You have ${MAX_LIVE_STORIES} Stories up already.` });
  }
  const expiresAt = new Date(now.getTime() + STORY_TTL_MS);
  const caption = input.caption && input.caption.length > 0 ? input.caption : null;
  const story = await getDb().transaction(async (tx) => {
    const [made] = await tx
      .insert(stories)
      .values({ authorId: userId, audience: input.audience, caption, createdAt: now, expiresAt })
      .returning({ id: stories.id });
    // Only MY finished photo, on no card, post or other Story, and young enough that the clean-up cannot take it.
    const attached = await tx
      .update(media)
      .set({ storyId: made!.id, updatedAt: sql`now()` })
      .where(
        and(
          eq(media.id, input.photoId),
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
    return made!;
  });
  return { id: story.id, expiresAt: expiresAt.toISOString() };
}

/** Take my Story down before its time. Anyone else's (or a made-up one) is the same 404. */
export async function removeStory(userId: string, storyId: string): Promise<void> {
  await enforceRateLimit(`stories:manage:${userId}`, STORY_RATE.manage);
  if (!idParamSchema.safeParse(storyId).success) throw new AppError('NOT_FOUND');
  const gone = await getDb()
    .delete(stories)
    .where(and(eq(stories.id, storyId), eq(stories.authorId, userId)))
    .returning({ id: stories.id });
  if (gone.length === 0) throw new AppError('NOT_FOUND');
}

// ─── reading ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The row of Story rings on Home: mine first (when I have one), then Pals with unseen Stories, newest first. */
export async function storyRing(viewerId: string, now: Date = new Date()): Promise<StoryRingItem[]> {
  await enforceRateLimit(`stories:read:${viewerId}`, STORY_RATE.read);
  const reach = await palsReaching(viewerId);
  const rows = await visibleStories(viewerId, [viewerId, ...reach.keys()], now);
  if (rows.length === 0) return [];
  const seen = new Set(
    (
      await getDb()
        .select({ storyId: storyViews.storyId })
        .from(storyViews)
        .where(
          and(
            eq(storyViews.viewerId, viewerId),
            inArray(
              storyViews.storyId,
              rows.map((r) => r.id),
            ),
          ),
        )
    ).map((v) => v.storyId),
  );
  const byAuthor = new Map<string, LiveRow[]>();
  for (const r of rows) byAuthor.set(r.authorId, [...(byAuthor.get(r.authorId) ?? []), r]);
  const cards = await getCards([...byAuthor.keys()]);
  const items = [...byAuthor.entries()].flatMap(([authorId, list]): StoryRingItem[] => {
    const card = cards.get(authorId);
    if (!card) return [];
    const mine = authorId === viewerId;
    return [
      {
        person: personOf(card),
        mine,
        unseen: !mine && list.some((s) => !seen.has(s.id)),
        count: list.length,
        latestAt: list.at(-1)!.createdAt.toISOString(),
      },
    ];
  });
  return items.sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      Number(b.unseen) - Number(a.unseen) ||
      b.latestAt.localeCompare(a.latestAt),
  );
}

/**
 * One person's live Stories as `viewerId` may see them, oldest first; null when there are none for them (or the call
 * sign is made up — the same answer). For my own: who reacted, and who viewed when we both share views.
 */
export async function storiesOf(
  viewerId: string,
  handle: string,
  now: Date = new Date(),
): Promise<StoryItem[] | null> {
  await enforceRateLimit(`stories:read:${viewerId}`, STORY_RATE.read);
  const author = await resolveHandle(handle);
  if (!author) return null;
  const rows = await visibleStories(viewerId, [author.userId], now);
  if (rows.length === 0) return null;
  const ids = rows.map((r) => r.id);
  const mine = author.userId === viewerId;
  const db = getDb();

  const [myReactions, allReactions, views] = await Promise.all([
    db
      .select({ storyId: storyReactions.storyId, kind: storyReactions.kind })
      .from(storyReactions)
      .where(and(inArray(storyReactions.storyId, ids), eq(storyReactions.userId, viewerId))),
    mine
      ? db
          .select({
            storyId: storyReactions.storyId,
            userId: storyReactions.userId,
            kind: storyReactions.kind,
          })
          .from(storyReactions)
          .where(inArray(storyReactions.storyId, ids))
          .orderBy(desc(storyReactions.createdAt))
      : Promise.resolve([]),
    mine
      ? db
          .select({ storyId: storyViews.storyId, viewerId: storyViews.viewerId })
          .from(storyViews)
          .where(inArray(storyViews.storyId, ids))
          .orderBy(desc(storyViews.viewedAt))
      : Promise.resolve([]),
  ]);
  const people = [...new Set([...allReactions.map((r) => r.userId), ...views.map((v) => v.viewerId)])];
  const [cards, hidden, limited, sharing] = await Promise.all([
    getCards(people),
    hiddenAuthors(viewerId, people),
    // Someone I restricted (or blocked) is never listed, even for a view from before (the user's rule, ADR-047).
    mine ? limitedAmong(viewerId, people) : Promise.resolve(new Set<string>()),
    // Reciprocal: viewers are named only when I share and they share.
    mine
      ? sharingStoryViews([viewerId, ...views.map((v) => v.viewerId)])
      : Promise.resolve(new Set<string>()),
  ]);
  const iShare = sharing.has(viewerId);
  const shown = (id: string) => cards.has(id) && !hidden.has(id) && !limited.has(id);
  const myKind = new Map(myReactions.flatMap((r) => (isKind(r.kind) ? [[r.storyId, r.kind] as const] : [])));

  return rows.map((r) => {
    let viewers: StoryViewer[] | null = null;
    let reactions: StoryViewer[] | null = null;
    if (mine) {
      const reactedBy = new Map(
        allReactions
          .filter((x) => x.storyId === r.id && isKind(x.kind) && shown(x.userId))
          .map((x) => [x.userId, x.kind as ReactionKind]),
      );
      const viewerIds = iShare
        ? views
            .filter((v) => v.storyId === r.id && sharing.has(v.viewerId) && shown(v.viewerId))
            .map((v) => v.viewerId)
        : [];
      viewers = iShare
        ? viewerIds.map((id) => ({ person: personOf(cards.get(id)!), reaction: reactedBy.get(id) ?? null }))
        : null;
      const named = new Set(viewerIds);
      reactions = [...reactedBy.entries()]
        .filter(([id]) => !named.has(id))
        .map(([id, kind]) => ({ person: personOf(cards.get(id)!), reaction: kind }));
    }
    return {
      id: r.id,
      caption: r.caption,
      photo: { url: `/api/stories/${r.id}/photo?v=${r.mediaId}`, width: r.width ?? 0, height: r.height ?? 0 },
      postedAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      mine,
      myReaction: myKind.get(r.id) ?? null,
      audience: mine ? (r.audience as StoryAudience) : null,
      viewers,
      reactions,
    };
  });
}

/** I opened this Story (someone else's). Recorded once; whether the author may see it is decided when they look. */
export async function markViewed(viewerId: string, storyId: string, now: Date = new Date()): Promise<void> {
  await enforceRateLimit(`stories:read:${viewerId}`, STORY_RATE.read);
  const story = await visibleStory(viewerId, storyId, now);
  if (!story) throw new AppError('NOT_FOUND');
  if (story.authorId === viewerId) return;
  await getDb().insert(storyViews).values({ storyId, viewerId, viewedAt: now }).onConflictDoNothing();
}

/** Give, change or take back my reaction. Only on a Story I may see that is not mine; a new one rings the author. */
export async function reactToStory(
  userId: string,
  storyId: string,
  kind: ReactionKind | null,
  now: Date = new Date(),
): Promise<{ myReaction: ReactionKind | null }> {
  await enforceRateLimit(`stories:react:${userId}`, STORY_RATE.react);
  if (kind === null) {
    if (idParamSchema.safeParse(storyId).success) {
      await getDb()
        .delete(storyReactions)
        .where(and(eq(storyReactions.storyId, storyId), eq(storyReactions.userId, userId)));
    }
    return { myReaction: null };
  }
  await enforceNewAccountLimit(userId, 'reaction');
  const story = await visibleStory(userId, storyId, now);
  if (!story) throw new AppError('NOT_FOUND');
  if (story.authorId === userId) {
    throw new AppError('BAD_REQUEST', { message: 'You cannot react to your own Story.' });
  }
  const made = await getDb()
    .insert(storyReactions)
    .values({ storyId, userId, kind, createdAt: now })
    .onConflictDoNothing()
    .returning({ storyId: storyReactions.storyId });
  if (made.length === 0) {
    await getDb()
      .update(storyReactions)
      .set({ kind })
      .where(and(eq(storyReactions.storyId, storyId), eq(storyReactions.userId, userId)));
  } else {
    emit({ type: 'story.reacted', storyId, authorId: story.authorId, actorId: userId });
  }
  return { myReaction: kind };
}

/** The photo of a Story `viewerId` may see, or null. */
export async function storyPhotoFor(
  viewerId: string,
  storyId: string,
  now: Date = new Date(),
): Promise<string | null> {
  return (await visibleStory(viewerId, storyId, now))?.mediaId ?? null;
}

/** A Story as a report needs it: whose, its photo and caption. Only for someone who may see it, and not its author. */
export async function storyForReport(
  viewerId: string,
  storyId: string,
  now: Date = new Date(),
): Promise<{ authorId: string; mediaId: string; caption: string | null } | null> {
  const story = await visibleStory(viewerId, storyId, now);
  if (!story || story.authorId === viewerId) return null;
  return { authorId: story.authorId, mediaId: story.mediaId, caption: story.caption };
}

/** My live Stories, for "Download my data". */
export async function storiesExport(
  userId: string,
  now: Date = new Date(),
): Promise<{ caption: string | null; postedAt: Date; expiresAt: Date; photoId: string | null }[]> {
  const rows = await getDb()
    .select({
      caption: stories.caption,
      postedAt: stories.createdAt,
      expiresAt: stories.expiresAt,
      photoId: media.id,
    })
    .from(stories)
    .leftJoin(media, and(eq(media.storyId, stories.id), eq(media.status, 'ready')))
    .where(and(eq(stories.authorId, userId), gt(stories.expiresAt, now)))
    .orderBy(asc(stories.createdAt));
  return rows;
}

/** Daily: Stories past their 12 hours are deleted (views and reactions with them; the photo's file by its clean-up). */
export async function purgeExpiredStories(now: Date = new Date()): Promise<{ storiesCleared: number }> {
  const gone = await getDb().delete(stories).where(lte(stories.expiresAt, now)).returning({ id: stories.id });
  return { storiesCleared: gone.length };
}
