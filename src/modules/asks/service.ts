import { askAnswers, asks, media } from '@db/schema';
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { enforceNewAccountLimit, shouldHoldForOthers } from '@/modules/moderation';
import { getCards, type PersonCard } from '@/modules/profiles';
import { friendIdsOf, hiddenAuthors, posseMembersAmong } from '@/modules/relationships';
import { decodeCursor, encodeCursor, type Cursor } from '@/platform/cursor';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import { idParamSchema } from '@/shared/validation/fence';
import type { PortraitTint } from '@/shared/validation/profile';
import {
  ASK_OUTCOMES,
  ASK_VERDICTS,
  type AskAudience,
  type AskList,
  type AskOutcome,
  type AskVerdict,
  type CreatePublicAskInput,
} from '@/shared/validation/town-halls';

/**
 * Public "Buy or wait?" (ADR-066): questions asked outside any group, to my friends or to everyone on Howdy. Who may
 * see one is decided every time it is read: its asker always; a held one nobody else; anyone hidden from the viewer
 * (block or mute, either way) or an inactive account never; `everyone` questions anyone, signed in or not; `friends`
 * questions the asker's friends. Anything a viewer may not see is "not found", the same as a question that is not there.
 */

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
export const ASK_RATE = {
  read: rule(240, 60),
  /** Shared with group questions: three a day per person, wherever they ask (each one rings people). */
  daily: rule(3, 24 * 3600),
  answer: rule(200, 3600),
  manage: rule(120, 3600),
} as const;
/** The key for the shared daily limit (group questions spend it too). */
export const askDailyKey = (userId: string) => `asks:daily:${userId}`;

/** Held questions nobody can see but their asker are dropped after this long (see docs/DATA_LIFECYCLE.md). */
export const HELD_ASK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ASK_PAGE_SIZE = 20;
/** How many friends are rung about a new question (most recent friendships first). */
const RING_CAP = 300;

export interface AskAuthor {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  verified: boolean;
  trusted: boolean;
  /** Filled in by the app layer only when the viewer may see it. */
  portraitUrl?: string;
}

export interface AskAnswerView {
  author: AskAuthor;
  verdict: AskVerdict;
  reason: string;
  mine: boolean;
}

/** A question's photo (ADR-066), served by /api/asks/{id}/photo to exactly who may see the question. */
export interface AskPhoto {
  url: string;
  width: number;
  height: number;
}

/** A public question as one viewer sees it. The same core as a group question, so one card shows both. */
export interface AskView {
  id: string;
  author: AskAuthor;
  audience: AskAudience;
  item: string;
  priceRupees: number;
  why: string;
  alternative: string | null;
  /** The asker's photo of the thing, if any (one held by the photo check is shown to its asker only). */
  photo: AskPhoto | null;
  note: string | null;
  outcome: AskOutcome | null;
  counts: Record<AskVerdict, number>;
  answers: AskAnswerView[];
  mine: { verdict: AskVerdict; reason: string } | null;
  /** Signed in, not the asker, published and undecided. */
  canAnswer: boolean;
  isAsker: boolean;
  createdAt: Date;
}

export interface AskPage {
  asks: AskView[];
  nextCursor: string | null;
}

type Row = typeof asks.$inferSelect;

const toAuthor = (p: PersonCard): AskAuthor => ({
  handle: p.handle,
  displayName: p.displayName,
  portraitTint: p.portraitTint,
  verified: p.verified,
  trusted: p.trusted,
});
/** A photo held by the photo check (ADR-039) is shown only to the person who posted it. */
const photoShownTo = (viewerId: string | null) =>
  viewerId ? or(eq(media.held, false), eq(media.ownerId, viewerId)) : eq(media.held, false);
/** A waiting photo is attached only this soon after upload, so the hourly clean-up cannot take it mid-post. */
const PHOTO_ATTACH_WINDOW_MS = 55 * 60_000;

/** The live photos on these questions that this viewer may see, by question id. */
async function photosOn(viewerId: string | null, askIds: string[]): Promise<Map<string, AskPhoto>> {
  if (askIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: media.id, askId: media.askId, width: media.width, height: media.height })
    .from(media)
    .where(
      and(
        inArray(media.askId, askIds),
        eq(media.kind, 'card_photo'),
        eq(media.status, 'ready'),
        photoShownTo(viewerId),
      ),
    );
  return new Map(
    rows.map((r) => [
      r.askId!,
      { url: `/api/asks/${r.askId}/photo?v=${r.id}`, width: r.width ?? 0, height: r.height ?? 0 },
    ]),
  );
}

const isVerdict = (v: string): v is AskVerdict => (ASK_VERDICTS as readonly string[]).includes(v);
const isOutcome = (v: string | null): v is AskOutcome =>
  v !== null && (ASK_OUTCOMES as readonly string[]).includes(v);

/** Which of these rows may this viewer (null = signed out) see right now? Returns the visible rows and their askers. */
async function visibleRows(
  viewerId: string | null,
  rows: Row[],
): Promise<{ rows: Row[]; authors: Map<string, PersonCard> }> {
  if (rows.length === 0) return { rows: [], authors: new Map() };
  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const friendsAsked = rows.filter((r) => r.audience === 'friends' && r.authorId !== viewerId);
  const [authors, hidden, friends] = await Promise.all([
    getCards(authorIds),
    viewerId ? hiddenAuthors(viewerId, authorIds) : Promise.resolve(new Set<string>()),
    viewerId && friendsAsked.length
      ? posseMembersAmong(
          viewerId,
          friendsAsked.map((r) => r.authorId),
        )
      : Promise.resolve(new Set<string>()),
  ]);
  const ok = rows.filter((r) => {
    if (!authors.has(r.authorId)) return false;
    if (r.authorId === viewerId) return true;
    if (r.status !== 'published' || hidden.has(r.authorId)) return false;
    return r.audience === 'everyone' || (viewerId !== null && friends.has(r.authorId));
  });
  return { rows: ok, authors };
}

async function hydrate(
  viewerId: string | null,
  rows: Row[],
  authors: Map<string, PersonCard>,
): Promise<AskView[]> {
  if (rows.length === 0) return [];
  const answers = await getDb()
    .select()
    .from(askAnswers)
    .where(
      inArray(
        askAnswers.askId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(askAnswers.answeredAt));
  const people = [...new Set(answers.map((a) => a.userId))];
  const [cards, hidden, photos] = await Promise.all([
    getCards(people),
    viewerId ? hiddenAuthors(viewerId, people) : Promise.resolve(new Set<string>()),
    photosOn(
      viewerId,
      rows.map((r) => r.id),
    ),
  ]);
  return rows.map((r) => {
    const outcome = isOutcome(r.outcome) ? r.outcome : null;
    const view: AskView = {
      id: r.id,
      author: toAuthor(authors.get(r.authorId)!),
      audience: r.audience === 'friends' ? 'friends' : 'everyone',
      item: r.item,
      priceRupees: r.priceRupees,
      why: r.why,
      alternative: r.alternative,
      photo: photos.get(r.id) ?? null,
      note: r.note,
      outcome,
      counts: { buy: 0, wait: 0 },
      answers: [],
      mine: null,
      canAnswer: viewerId !== null && r.authorId !== viewerId && r.status === 'published' && outcome === null,
      isAsker: r.authorId === viewerId,
      createdAt: r.createdAt,
    };
    for (const a of answers) {
      if (a.askId !== r.id || !isVerdict(a.verdict)) continue;
      const card = cards.get(a.userId);
      if (!card) continue; // no longer active: their answer does not count
      view.counts[a.verdict] += 1;
      const mine = a.userId === viewerId;
      if (mine) view.mine = { verdict: a.verdict, reason: a.reason };
      if (!hidden.has(a.userId)) {
        view.answers.push({ author: toAuthor(card), verdict: a.verdict, reason: a.reason, mine });
      }
    }
    return view;
  });
}

/** One question this viewer may see, or null (signed out: `everyone` questions only). */
async function loadVisible(viewerId: string | null, askId: string): Promise<Row | null> {
  if (!idParamSchema.safeParse(askId).success) return null;
  const [row] = await getDb().select().from(asks).where(eq(asks.id, askId)).limit(1);
  if (!row) return null;
  const { rows } = await visibleRows(viewerId, [row]);
  return rows[0] ?? null;
}

/** A question as this viewer sees it, or null. `rateKey`: who to count the read against (a signed-out IP). */
export async function getAsk(
  viewerId: string | null,
  askId: string,
  rateKey: string,
): Promise<AskView | null> {
  await enforceRateLimit(`asks:read:${rateKey}`, ASK_RATE.read);
  const row = await loadVisible(viewerId, askId);
  if (!row) return null;
  const authors = await getCards([row.authorId]);
  const [view] = await hydrate(viewerId, [row], authors);
  return view ?? null;
}

/**
 * The Buy or wait page, newest first: `all` = everyone's questions plus my friends' and my own; `friends` = my
 * friends' only; `mine` = mine (held ones too, which look posted to me). A bad cursor is a 400.
 */
export async function listAsks(
  viewerId: string,
  show: AskList,
  opts: { cursor?: string | undefined; limit?: number | undefined } = {},
): Promise<AskPage> {
  let cursor: Cursor | null = null;
  if (opts.cursor !== undefined) {
    cursor = decodeCursor(opts.cursor);
    if (!cursor) throw new AppError('BAD_REQUEST', { message: 'That page marker is not valid.' });
  }
  await enforceRateLimit(`asks:read:${viewerId}`, ASK_RATE.read);
  const limit = Math.min(Math.max(opts.limit ?? ASK_PAGE_SIZE, 1), 50);
  const friends = show === 'mine' ? [] : await friendIdsOf(viewerId);
  const published = eq(asks.status, 'published');
  const fromFriends = friends.length ? and(published, inArray(asks.authorId, friends)) : undefined;
  let who: SQL | undefined;
  if (show === 'mine') who = eq(asks.authorId, viewerId);
  else if (show === 'friends') who = fromFriends ?? sql`false`;
  else
    who = or(
      and(published, eq(asks.audience, 'everyone')),
      ...(fromFriends ? [fromFriends] : []),
      eq(asks.authorId, viewerId),
    );
  // Fetch a little extra: a few rows may drop out (hidden, inactive) after the query.
  const raw = await getDb()
    .select()
    .from(asks)
    .where(and(who, cursor ? sql`(${asks.createdAt}, ${asks.id}) < (${cursor.at}, ${cursor.id})` : undefined))
    .orderBy(desc(asks.createdAt), desc(asks.id))
    .limit(limit + 1);
  const more = raw.length > limit;
  const page = raw.slice(0, limit);
  const { rows, authors } = await visibleRows(viewerId, page);
  const last = page.at(-1);
  return {
    asks: await hydrate(viewerId, rows, authors),
    nextCursor: more && last ? encodeCursor({ at: last.createdAt, id: last.id }) : null,
  };
}

/**
 * Ask a public question. Three a day per person (shared with group questions), the new-account limits of a post, and
 * the post hold rule (ADR-024): a held question looks asked to its asker and rings nobody. A published one rings the
 * asker's friends (both audiences; an `everyone` question is also on the Buy or wait page for all).
 */
export async function createPublicAsk(userId: string, input: CreatePublicAskInput): Promise<AskView> {
  await enforceRateLimit(askDailyKey(userId), ASK_RATE.daily);
  await enforceNewAccountLimit(userId, 'card');
  const status = (await shouldHoldForOthers(userId)) ? 'held' : 'published';
  const row = await getDb().transaction(async (tx) => {
    const [made] = await tx
      .insert(asks)
      .values({
        authorId: userId,
        audience: input.audience,
        item: input.item,
        priceRupees: input.price,
        why: input.why,
        alternative: input.alternative ?? null,
        status,
        createdAt: new Date(), // whole milliseconds, so cursors compare exactly
      })
      .returning();
    if (input.photoId) {
      // Only MY finished photo, on nothing else yet, and young enough that the clean-up cannot take it.
      const attached = await tx
        .update(media)
        .set({ askId: made!.id, updatedAt: sql`now()` })
        .where(
          and(
            eq(media.id, input.photoId),
            eq(media.ownerId, userId),
            eq(media.kind, 'card_photo'),
            eq(media.status, 'ready'),
            isNull(media.cardId),
            isNull(media.hallPostId),
            isNull(media.storyId),
            isNull(media.askId),
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
    return made!;
  });
  if (status === 'published') emit({ type: 'ask.created', askId: row.id, authorId: userId });
  const [view] = await hydrate(userId, [row], await getCards([userId]));
  if (!view) throw new AppError('INTERNAL');
  return view;
}

/** Friends to ring about a new question: most recent friendships first, capped. */
export const friendsToRing = (authorId: string) => friendIdsOf(authorId, RING_CAP);

async function viewOf(viewerId: string, row: Row): Promise<AskView> {
  const [view] = await hydrate(viewerId, [row], await getCards([row.authorId]));
  if (!view) throw new AppError('NOT_FOUND');
  return view;
}

/**
 * Answer a question: buy or wait with a reason, or `null` to take it back. Whoever may see it, except its asker, while it
 * is published and undecided. Only a first answer rings the asker.
 */
export async function answerPublicAsk(
  userId: string,
  askId: string,
  answer: { verdict: AskVerdict; reason: string } | null,
): Promise<AskView> {
  await enforceRateLimit(`asks:answer:${userId}`, ASK_RATE.answer);
  await enforceNewAccountLimit(userId, 'reply');
  const row = await loadVisible(userId, askId);
  if (!row || row.status !== 'published') throw new AppError('NOT_FOUND');
  const db = getDb();
  if (answer === null) {
    await db.delete(askAnswers).where(and(eq(askAnswers.askId, askId), eq(askAnswers.userId, userId)));
    return viewOf(userId, row);
  }
  if (row.authorId === userId) {
    throw new AppError('BAD_REQUEST', { message: 'This is your own question. Others answer it.' });
  }
  if (row.outcome !== null) {
    throw new AppError('BAD_REQUEST', { message: 'They have already decided, so answers are closed.' });
  }
  const made = await db
    .insert(askAnswers)
    .values({ askId, userId, verdict: answer.verdict, reason: answer.reason, answeredAt: new Date() })
    .onConflictDoNothing()
    .returning({ askId: askAnswers.askId });
  if (made.length === 0) {
    await db
      .update(askAnswers)
      .set({ verdict: answer.verdict, reason: answer.reason, answeredAt: new Date() })
      .where(and(eq(askAnswers.askId, askId), eq(askAnswers.userId, userId)));
  } else {
    emit({ type: 'ask.answered', askId, askAuthorId: row.authorId, actorId: userId });
  }
  return viewOf(userId, row);
}

/** The asker's own question (any status), or 404 for anyone else. */
async function ownRow(userId: string, askId: string): Promise<Row> {
  await enforceRateLimit(`asks:manage:${userId}`, ASK_RATE.manage);
  if (!idParamSchema.safeParse(askId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb()
    .select()
    .from(asks)
    .where(and(eq(asks.id, askId), eq(asks.authorId, userId)))
    .limit(1);
  if (!row) throw new AppError('NOT_FOUND');
  return row;
}

/** The asker's ONE update. A second one is a 409. */
export async function notePublicAsk(userId: string, askId: string, note: string): Promise<AskView> {
  await ownRow(userId, askId);
  const [row] = await getDb()
    .update(asks)
    .set({ note, notedAt: new Date() })
    .where(and(eq(asks.id, askId), sql`${asks.note} is null`))
    .returning();
  if (!row) throw new AppError('CONFLICT', { message: 'You have already added your one update.' });
  return viewOf(userId, row);
}

/** Say what you decided (answers close); may be changed later. */
export async function decidePublicAsk(userId: string, askId: string, outcome: AskOutcome): Promise<AskView> {
  await ownRow(userId, askId);
  const [row] = await getDb()
    .update(asks)
    .set({ outcome, decidedAt: new Date() })
    .where(eq(asks.id, askId))
    .returning();
  return viewOf(userId, row!);
}

/** Take my question down, with its answers. Anyone else gets a 404. */
export async function removePublicAsk(userId: string, askId: string): Promise<void> {
  await ownRow(userId, askId);
  await getDb().delete(asks).where(eq(asks.id, askId));
}

/**
 * The photo on a question, for exactly who may see the question (signed out: `everyone` questions only), and not one
 * held by the photo check unless it is theirs. Missing, hidden and "no photo" are all null.
 */
export async function askPhotoFor(viewerId: string | null, askId: string): Promise<string | null> {
  const row = await loadVisible(viewerId, askId);
  if (!row) return null;
  const [photo] = await getDb()
    .select({ id: media.id })
    .from(media)
    .where(
      and(
        eq(media.askId, row.id),
        eq(media.kind, 'card_photo'),
        eq(media.status, 'ready'),
        photoShownTo(viewerId),
      ),
    )
    .limit(1);
  return photo?.id ?? null;
}

/** A question the reader may see, in the shape a report needs. Null otherwise. */
export async function askForReport(
  userId: string,
  askId: string,
): Promise<{ id: string; authorId: string; evidence: string } | null> {
  const row = await loadVisible(userId, askId);
  return row
    ? { id: row.id, authorId: row.authorId, evidence: `${row.item} (₹${row.priceRupees}): ${row.why}` }
    : null;
}

/** For notifications (read time): may `viewerId` see this question now? */
export async function visibleAskIds(viewerId: string, askIds: string[]): Promise<Set<string>> {
  if (askIds.length === 0) return new Set();
  const rows = await getDb()
    .select()
    .from(asks)
    .where(inArray(asks.id, [...new Set(askIds)]));
  const { rows: ok } = await visibleRows(viewerId, rows);
  return new Set(ok.map((r) => r.id));
}

/** Retention: held questions nobody answered for 30 days go. Returns how many. */
export async function purgeStaleHeldAsks(now: Date = new Date()): Promise<number> {
  const rows = await getDb()
    .delete(asks)
    .where(and(eq(asks.status, 'held'), lt(asks.createdAt, new Date(now.getTime() - HELD_ASK_RETENTION_MS))))
    .returning({ id: asks.id });
  return rows.length;
}

/** "Download my data": my public questions and my answers to others'. */
export async function asksExport(userId: string): Promise<{
  questions: {
    audience: string;
    item: string;
    priceRupees: number;
    why: string;
    alternative: string | null;
    note: string | null;
    outcome: string | null;
    askedAt: Date;
  }[];
  answers: { item: string; verdict: string; reason: string; answeredAt: Date }[];
}> {
  const db = getDb();
  const [questions, answers] = await Promise.all([
    db.select().from(asks).where(eq(asks.authorId, userId)).orderBy(asc(asks.createdAt)).limit(5000),
    db
      .select({
        item: asks.item,
        verdict: askAnswers.verdict,
        reason: askAnswers.reason,
        answeredAt: askAnswers.answeredAt,
      })
      .from(askAnswers)
      .innerJoin(asks, eq(asks.id, askAnswers.askId))
      .where(eq(askAnswers.userId, userId))
      .orderBy(asc(askAnswers.answeredAt))
      .limit(5000),
  ]);
  return {
    questions: questions.map((q) => ({
      audience: q.audience,
      item: q.item,
      priceRupees: q.priceRupees,
      why: q.why,
      alternative: q.alternative,
      note: q.note,
      outcome: q.outcome,
      askedAt: q.createdAt,
    })),
    answers,
  };
}
