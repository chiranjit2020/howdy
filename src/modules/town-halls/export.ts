import {
  media,
  townHallAskAnswers,
  townHallAsks,
  townHallMembers,
  townHallEvents,
  townHallPollOptions,
  townHallPollVotes,
  townHallPosts,
  townHallReactions,
  townHallReplies,
  townHallRsvps,
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
  /** `photoId`: my own photo on the post (ADR-046), when it has one. `event`: when the post is an event (ADR-056). */
  posts: {
    body: string;
    postedAt: Date;
    photoId: string | null;
    event: { title: string; startsAt: Date; place: string | null } | null;
    /** When the post is a poll (ADR-057): its options, in order. Its question is the post's words. */
    pollOptions: string[] | null;
    /** When the post is a "Buy or wait?" (ADR-065). Why I wanted it is the post's words. */
    ask: {
      item: string;
      priceRupees: number;
      alternative: string | null;
      note: string | null;
      outcome: string | null;
    } | null;
  }[];
  replies: { body: string; postedAt: Date }[];
  reactions: { kind: string; givenAt: Date }[];
  /** My answers to events (going, maybe, no). */
  eventAnswers: { event: string; answer: string; answeredAt: Date }[];
  /** My votes in polls: the question and the option I chose. */
  pollVotes: { question: string; option: string; votedAt: Date }[];
  /** My answers to others' "Buy or wait?": the item, buy or wait, and my reason. */
  askAnswers: { item: string; verdict: string; reason: string; answeredAt: Date }[];
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

  const [posts, replies, reactions, answers, options, votes, askAnswers] = await Promise.all([
    db
      .select({
        id: townHallPosts.id,
        hallId: townHallPosts.townHallId,
        body: townHallPosts.body,
        createdAt: townHallPosts.createdAt,
        photoId: media.id,
        eventTitle: townHallEvents.title,
        eventStartsAt: townHallEvents.startsAt,
        eventPlace: townHallEvents.place,
        askItem: townHallAsks.item,
        askPrice: townHallAsks.priceRupees,
        askAlternative: townHallAsks.alternative,
        askNote: townHallAsks.note,
        askOutcome: townHallAsks.outcome,
      })
      .from(townHallPosts)
      .leftJoin(
        media,
        and(eq(media.hallPostId, townHallPosts.id), eq(media.kind, 'card_photo'), eq(media.status, 'ready')),
      )
      .leftJoin(townHallEvents, eq(townHallEvents.postId, townHallPosts.id))
      .leftJoin(townHallAsks, eq(townHallAsks.postId, townHallPosts.id))
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
    db
      .select({
        hallId: townHallPosts.townHallId,
        event: townHallEvents.title,
        answer: townHallRsvps.answer,
        answeredAt: townHallRsvps.answeredAt,
      })
      .from(townHallRsvps)
      .innerJoin(townHallEvents, eq(townHallEvents.postId, townHallRsvps.postId))
      .innerJoin(townHallPosts, eq(townHallPosts.id, townHallRsvps.postId))
      .where(and(eq(townHallRsvps.userId, userId), inArray(townHallPosts.townHallId, ids)))
      .orderBy(asc(townHallRsvps.answeredAt))
      .limit(EXPORT_CAP),
    db
      .select({ postId: townHallPollOptions.postId, label: townHallPollOptions.label })
      .from(townHallPollOptions)
      .innerJoin(townHallPosts, eq(townHallPosts.id, townHallPollOptions.postId))
      .where(and(eq(townHallPosts.authorId, userId), inArray(townHallPosts.townHallId, ids)))
      .orderBy(asc(townHallPollOptions.postId), asc(townHallPollOptions.position))
      .limit(EXPORT_CAP),
    db
      .select({
        hallId: townHallPosts.townHallId,
        question: townHallPosts.body,
        option: townHallPollOptions.label,
        votedAt: townHallPollVotes.votedAt,
      })
      .from(townHallPollVotes)
      .innerJoin(townHallPollOptions, eq(townHallPollOptions.id, townHallPollVotes.optionId))
      .innerJoin(townHallPosts, eq(townHallPosts.id, townHallPollVotes.postId))
      .where(and(eq(townHallPollVotes.userId, userId), inArray(townHallPosts.townHallId, ids)))
      .orderBy(asc(townHallPollVotes.votedAt))
      .limit(EXPORT_CAP),
    db
      .select({
        hallId: townHallPosts.townHallId,
        item: townHallAsks.item,
        verdict: townHallAskAnswers.verdict,
        reason: townHallAskAnswers.reason,
        answeredAt: townHallAskAnswers.answeredAt,
      })
      .from(townHallAskAnswers)
      .innerJoin(townHallAsks, eq(townHallAsks.postId, townHallAskAnswers.postId))
      .innerJoin(townHallPosts, eq(townHallPosts.id, townHallAskAnswers.postId))
      .where(and(eq(townHallAskAnswers.userId, userId), inArray(townHallPosts.townHallId, ids)))
      .orderBy(asc(townHallAskAnswers.answeredAt))
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
      .map((p) => ({
        body: p.body,
        postedAt: p.createdAt,
        photoId: p.photoId,
        event:
          p.eventTitle && p.eventStartsAt
            ? { title: p.eventTitle, startsAt: p.eventStartsAt, place: p.eventPlace }
            : null,
        pollOptions: options.some((o) => o.postId === p.id)
          ? options.filter((o) => o.postId === p.id).map((o) => o.label)
          : null,
        ask:
          p.askItem !== null && p.askPrice !== null
            ? {
                item: p.askItem,
                priceRupees: p.askPrice,
                alternative: p.askAlternative,
                note: p.askNote,
                outcome: p.askOutcome,
              }
            : null,
      })),
    replies: replies.filter((r) => r.hallId === h.id).map((r) => ({ body: r.body, postedAt: r.createdAt })),
    reactions: reactions
      .filter((r) => r.hallId === h.id)
      .map((r) => ({ kind: r.kind, givenAt: r.createdAt })),
    eventAnswers: answers
      .filter((a) => a.hallId === h.id)
      .map((a) => ({ event: a.event, answer: a.answer, answeredAt: a.answeredAt })),
    pollVotes: votes
      .filter((v) => v.hallId === h.id)
      .map((v) => ({ question: v.question, option: v.option, votedAt: v.votedAt })),
    askAnswers: askAnswers
      .filter((a) => a.hallId === h.id)
      .map((a) => ({ item: a.item, verdict: a.verdict, reason: a.reason, answeredAt: a.answeredAt })),
  }));
}
