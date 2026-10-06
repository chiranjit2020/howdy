import {
  media,
  townHallMembers,
  townHallPosts,
  townHallReactions,
  townHallReplies,
  townHalls,
} from '@db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/platform/db';

/**
 * The Town Halls part of "Download my data" (ADR-037): the Town Halls I am a member of (as "My Town Halls" lists them),
 * and what I wrote in their feeds. A post or reply HELD for the owner looks posted to me in the app, so it is simply
 * posted here. Words in a Town Hall I have left are not shown to me in the app, so they are not exported either.
 */

const EXPORT_CAP = 5000;
const HALLS_CAP = 200;

export interface HallExport {
  name: string;
  description: string;
  visibility: string;
  role: 'owner' | 'deputy' | 'member';
  joinedAt: Date;
  /** `photoId`: my own photo on the post (ADR-046), when it has one. */
  posts: { body: string; postedAt: Date; photoId: string | null }[];
  replies: { body: string; postedAt: Date }[];
  reactions: { kind: string; givenAt: Date }[];
}

export async function townHallsExport(userId: string): Promise<HallExport[]> {
  const db = getDb();
  const halls = await db
    .select({
      id: townHalls.id,
      name: townHalls.name,
      description: townHalls.description,
      visibility: townHalls.visibility,
      role: townHallMembers.role,
      joinedAt: townHallMembers.createdAt,
    })
    .from(townHallMembers)
    .innerJoin(townHalls, eq(townHalls.id, townHallMembers.townHallId))
    .where(and(eq(townHallMembers.userId, userId), eq(townHallMembers.status, 'active')))
    .orderBy(asc(townHallMembers.createdAt))
    .limit(HALLS_CAP);
  if (halls.length === 0) return [];
  const ids = halls.map((h) => h.id);

  const [posts, replies, reactions] = await Promise.all([
    db
      .select({
        hallId: townHallPosts.townHallId,
        body: townHallPosts.body,
        createdAt: townHallPosts.createdAt,
        photoId: media.id,
      })
      .from(townHallPosts)
      .leftJoin(
        media,
        and(eq(media.hallPostId, townHallPosts.id), eq(media.kind, 'card_photo'), eq(media.status, 'ready')),
      )
      .where(and(eq(townHallPosts.authorId, userId), inArray(townHallPosts.townHallId, ids)))
      .orderBy(asc(townHallPosts.createdAt))
      .limit(EXPORT_CAP),
    db
      .select({
        hallId: townHallPosts.townHallId,
        body: townHallReplies.body,
        createdAt: townHallReplies.createdAt,
      })
      .from(townHallReplies)
      .innerJoin(townHallPosts, eq(townHallPosts.id, townHallReplies.postId))
      .where(and(eq(townHallReplies.authorId, userId), inArray(townHallPosts.townHallId, ids)))
      .orderBy(asc(townHallReplies.createdAt))
      .limit(EXPORT_CAP),
    db
      .select({
        hallId: townHallPosts.townHallId,
        kind: townHallReactions.kind,
        createdAt: townHallReactions.createdAt,
      })
      .from(townHallReactions)
      .innerJoin(townHallPosts, eq(townHallPosts.id, townHallReactions.postId))
      .where(and(eq(townHallReactions.userId, userId), inArray(townHallPosts.townHallId, ids)))
      .orderBy(asc(townHallReactions.createdAt))
      .limit(EXPORT_CAP),
  ]);

  return halls.map((h) => ({
    name: h.name,
    description: h.description,
    visibility: h.visibility,
    role: h.role === 'owner' || h.role === 'deputy' ? h.role : 'member',
    joinedAt: h.joinedAt,
    posts: posts
      .filter((p) => p.hallId === h.id)
      .map((p) => ({ body: p.body, postedAt: p.createdAt, photoId: p.photoId })),
    replies: replies.filter((r) => r.hallId === h.id).map((r) => ({ body: r.body, postedAt: r.createdAt })),
    reactions: reactions
      .filter((r) => r.hallId === h.id)
      .map((r) => ({ kind: r.kind, givenAt: r.createdAt })),
  }));
}
