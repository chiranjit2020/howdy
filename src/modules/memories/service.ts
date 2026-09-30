import { posseLinks, postCards, tributes } from '@db/schema';
import { and, desc, eq, inArray, lte, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { getCards, type PersonCard } from '@/modules/profiles';
import { hiddenAuthors, posseMembersAmong } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import { addYears, anniversaryDays, APP_TIME_ZONE, dayOf } from '@/shared/calendar';
import type { PortraitTint } from '@/shared/validation/profile';

/**
 * Memories (Phase 12, ADR-028): what happened on this day in earlier years, for me alone. Nothing is stored — each
 * memory is worked out when it is read, from what is still there and still visible to me NOW: a removed card, a Tribute
 * taken down, someone who is no longer a Pal, someone blocked, muted or suspended — none of those come back as a
 * memory. "This day" is in Howdy's calendar (Asia/Kolkata).
 */

const READ: RateLimitRule = { limit: 120, windowSec: 60 };
const MAX_EACH = 20;

/** `portraitUrl` is filled in by the app layer only when the viewer may see it. */
type Person = { handle: string; displayName: string; portraitTint: PortraitTint; portraitUrl?: string };
const personOf = (c: PersonCard): Person => ({
  handle: c.handle,
  displayName: c.displayName,
  portraitTint: c.portraitTint,
});

export interface CardMemory {
  id: string;
  body: string;
  author: Person;
  yearsAgo: number;
}
export interface PalMemory {
  pal: Person;
  years: number;
}
export interface TributeMemory {
  id: string;
  body: string;
  author: Person;
  yearsAgo: number;
}
export interface MemoriesToday {
  cards: CardMemory[];
  pals: PalMemory[];
  tributes: TributeMemory[];
}

/** `col` falls on today's month and day (28 Feb also remembers 29 Feb), at least a year ago, in Howdy's calendar. */
function onThisDay(col: AnyColumn, today: string): SQL {
  const days = anniversaryDays(today);
  const local = sql`(${col} at time zone ${APP_TIME_ZONE})`;
  return and(inArray(sql`to_char(${local}, 'MM-DD')`, days), lte(sql`${local}::date`, addYears(today, -1)))!;
}
const yearsSince = (at: Date, today: string) => Number(today.slice(0, 4)) - Number(dayOf(at).slice(0, 4));

/** Today's memories for `userId`: cards on my Fence, when I became Pals with someone, and Tributes written to me. */
export async function memoriesToday(userId: string, now: Date = new Date()): Promise<MemoriesToday> {
  await enforceRateLimit(`memories:read:${userId}`, READ);
  const today = dayOf(now);
  const db = getDb();
  const [cardRows, palRows, tributeRows] = await Promise.all([
    db
      .select({
        id: postCards.id,
        body: postCards.body,
        authorId: postCards.authorId,
        at: postCards.createdAt,
      })
      .from(postCards)
      .where(
        and(
          eq(postCards.fenceOwnerId, userId),
          eq(postCards.status, 'published'),
          onThisDay(postCards.createdAt, today),
        ),
      )
      .orderBy(desc(postCards.createdAt))
      .limit(MAX_EACH),
    db
      .select({ low: posseLinks.userLow, high: posseLinks.userHigh, at: posseLinks.respondedAt })
      .from(posseLinks)
      .where(
        and(
          eq(posseLinks.status, 'accepted'),
          or(eq(posseLinks.userLow, userId), eq(posseLinks.userHigh, userId)),
          onThisDay(posseLinks.respondedAt, today),
        ),
      )
      .limit(MAX_EACH),
    db
      .select({ id: tributes.id, body: tributes.body, authorId: tributes.authorId, at: tributes.createdAt })
      .from(tributes)
      .where(
        and(
          eq(tributes.ownerId, userId),
          eq(tributes.status, 'published'),
          onThisDay(tributes.createdAt, today),
        ),
      )
      .orderBy(desc(tributes.createdAt))
      .limit(MAX_EACH),
  ]);

  const palIds = palRows.map((r) => (r.low === userId ? r.high : r.low));
  const people = [
    ...cardRows.map((r) => r.authorId),
    ...tributeRows.map((r) => r.authorId),
    ...palIds,
    userId,
  ];
  const [cards, hidden, stillPals] = await Promise.all([
    getCards([...new Set(people)]),
    hiddenAuthors(userId, people),
    posseMembersAmong(userId, palIds),
  ]);
  const seen = (id: string) => (id === userId || !hidden.has(id)) && cards.has(id);

  return {
    cards: cardRows.flatMap((r) =>
      seen(r.authorId)
        ? [
            {
              id: r.id,
              body: r.body,
              author: personOf(cards.get(r.authorId)!),
              yearsAgo: yearsSince(r.at, today),
            },
          ]
        : [],
    ),
    pals: palRows.flatMap((r, i) => {
      const id = palIds[i]!;
      return r.at && stillPals.has(id) && seen(id)
        ? [{ pal: personOf(cards.get(id)!), years: yearsSince(r.at, today) }]
        : [];
    }),
    tributes: tributeRows.flatMap((r) =>
      seen(r.authorId)
        ? [
            {
              id: r.id,
              body: r.body,
              author: personOf(cards.get(r.authorId)!),
              yearsAgo: yearsSince(r.at, today),
            },
          ]
        : [],
    ),
  };
}
