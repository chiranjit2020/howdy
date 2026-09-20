import { tracks } from '@db/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getCards, isShadowWalking } from '@/modules/profiles';
import { fenceStanding, hiddenAuthors, posseMembersAmong } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import type { DomainEvent } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import type { PortraitTint } from '@/shared/validation/profile';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
/** Fails closed. Reading is per person and does not depend on anyone else. */
export const RATE = { read: rule(120, 60) } as const;

/** A Track is kept for this many days (today counts as day one), then the retention job removes it. Reads ignore older rows at once. */
export const RETENTION_DAYS = 7;
/** Most people shown by name, and rows looked at while building one list (bounded work). */
export const LIST_CAP = 50;
const SCAN = 200;

/** Days since the visit, as the database counts them (UTC dates), so no clock or time zone of ours is involved. */
const UTC_TODAY = sql`(now() at time zone 'utc')::date`;
/** The oldest date still shown/kept (a code constant, inlined so the database sees `date - integer`, not `date - unknown`). */
const OLDEST = sql`${UTC_TODAY} - ${sql.raw(String(RETENTION_DAYS - 1))}`;

export type When = 'today' | 'yesterday' | 'this-week';

/** The only "when" anyone ever sees. Pure, so it is tested on its own. */
export function bucketOf(ageDays: number): When {
  return ageDays <= 0 ? 'today' : ageDays === 1 ? 'yesterday' : 'this-week';
}

// ─── recording a visit ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Note that `viewerId` stopped by `ownerId`'s Ranch. Runs after the visitor's response (a domain event), so the visitor's page never
 * depends on it and nothing about it is observable to them. Nothing is recorded for: yourself, a visitor on Shadow Walk, an
 * account that is not active, or a person in a block with the owner. What is stored is a pair of ids and a UTC date — no time of
 * day, no count, no address, no device, no place — and at most one write per pair per day.
 */
export async function recordVisit(viewerId: string, ownerId: string): Promise<void> {
  if (viewerId === ownerId) return;
  if (await isShadowWalking(viewerId)) return;
  const people = await getCards([viewerId, ownerId]);
  if (!people.has(viewerId) || !people.has(ownerId)) return;
  if ((await fenceStanding(ownerId, viewerId)).relationship === 'BLOCKED') return;
  // Same date already recorded = no change at all (the WHERE stops even a no-op write), so a person refreshing all day costs one row.
  await getDb().execute(sql`
    insert into tracks (owner_id, visitor_id, seen_on)
    values (${ownerId}, ${viewerId}, ${UTC_TODAY})
    on conflict (owner_id, visitor_id) do update set seen_on = excluded.seen_on
    where tracks.seen_on < excluded.seen_on`);
}

/** Turn what happened into Tracks. Subscribed to the domain events at start-up (src/app/_lib/wire-events.ts). */
export async function handleEvent(event: DomainEvent): Promise<void> {
  if (event.type === 'ranch.visited') await recordVisit(event.viewerId, event.ownerId);
}

// ─── reading my Tracks ───────────────────────────────────────────────────────────────────────────────────────────────

export interface TrackPerson {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  when: When;
}

export interface TracksView {
  /** Shadow Walk is on: my own Tracks are frozen (nothing is shown until I step out of the shadows). */
  frozen: boolean;
  /** People in my Posse who stopped by, newest day first, then by call sign (never in the order they arrived). */
  people: TrackPerson[];
  /** Everyone else, as counts per coarse bucket — no names, no clues. */
  hidden: Record<When, number>;
  days: number;
}

const EMPTY: Record<When, number> = { today: 0, yesterday: 0, 'this-week': 0 };

/**
 * Who stopped by my Ranch in the last week. The rules are applied NOW, from today's relationships, not as they were at the visit:
 * a person is named only while we are in each other's Posse; someone I muted or blocked (or who blocked me) is not shown or even
 * counted; inactive accounts disappear; and while I am on Shadow Walk the whole list is frozen. Times are only ever
 * Today / Yesterday / This week, and same-day visitors are ordered by call sign so the order leaks nothing.
 */
export async function listTracks(userId: string): Promise<TracksView> {
  await enforceRateLimit(`tracks:read:${userId}`, RATE.read);
  if (await isShadowWalking(userId))
    return { frozen: true, people: [], hidden: { ...EMPTY }, days: RETENTION_DAYS };

  const rows = await getDb()
    .select({ visitorId: tracks.visitorId, age: sql<number>`(${UTC_TODAY} - ${tracks.seenOn})::int` })
    .from(tracks)
    .where(and(eq(tracks.ownerId, userId), gte(tracks.seenOn, OLDEST)))
    .orderBy(desc(tracks.seenOn))
    .limit(SCAN);
  const ids = rows.map((r) => r.visitorId);
  const [cards, hiddenFromMe, posse] = await Promise.all([
    getCards(ids),
    hiddenAuthors(userId, ids),
    posseMembersAmong(userId, ids),
  ]);

  const hidden = { ...EMPTY };
  const people: (TrackPerson & { age: number })[] = [];
  for (const r of rows) {
    const card = cards.get(r.visitorId);
    if (!card || hiddenFromMe.has(r.visitorId)) continue;
    const when = bucketOf(r.age);
    if (posse.has(r.visitorId)) {
      people.push({
        handle: card.handle,
        displayName: card.displayName,
        portraitTint: card.portraitTint,
        when,
        age: r.age,
      });
    } else hidden[when]++;
  }
  people.sort((a, b) => a.age - b.age || a.handle.localeCompare(b.handle));
  return {
    frozen: false,
    people: people.slice(0, LIST_CAP).map(({ age: _age, ...p }) => p),
    hidden,
    days: RETENTION_DAYS,
  };
}

// ─── retention ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Retention: remove Tracks older than 7 days. Returns how many were removed. */
export async function purgeOldTracks(): Promise<{ tracks: number }> {
  const rows = await getDb()
    .delete(tracks)
    .where(sql`${tracks.seenOn} < ${OLDEST}`)
    .returning({ id: tracks.ownerId });
  return { tracks: rows.length };
}
