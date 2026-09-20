import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * A Track: "this person stopped by this Ranch". Deliberately the least it can be:
 *  - ONE row per (owner, visitor), holding only the UTC DATE of the latest visit — never a time of day, never a count, never an
 *    address, device or place;
 *  - written at most once per pair per day (the upsert changes nothing when the date is the same);
 *  - gone after 7 days (the retention job), and deleted with either person.
 * Who may SEE the visitor is not stored: it is decided when the list is read, from the current relationships.
 */
export const tracks = pgTable(
  'tracks',
  {
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    visitorId: uuid('visitor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seenOn: date('seen_on', { mode: 'string' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.visitorId] }),
    check('tracks_not_self', sql`${t.ownerId} <> ${t.visitorId}`),
    index('tracks_owner_seen_idx').on(t.ownerId, t.seenOn.desc()),
    index('tracks_seen_idx').on(t.seenOn),
    index('tracks_visitor_idx').on(t.visitorId),
  ],
);
