import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Time Capsule (Phase 12, ADR-028): words sealed until a date, to yourself or to one Pal. While sealed
 * (`opened_at is null`) the words are returned to nobody — not even their writer. On the day it opens only if the two
 * are still Pals with no block; otherwise the row is deleted, words and all. An opened capsule belongs to its
 * recipient until they delete it. Deleted with either account (CASCADE).
 */
export const timeCapsules = pgTable(
  'time_capsules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The writer themselves for a capsule to their future self. */
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** The day it opens, in Howdy's calendar time zone (Asia/Kolkata). */
    openOn: date('open_on', { mode: 'string' }).notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    openedAt: tstz('opened_at'),
  },
  (t) => [
    check('time_capsules_body_len', sql`char_length(${t.body}) between 1 and 500`),
    check('time_capsules_opened_after_sealed', sql`${t.openedAt} is null or ${t.openedAt} >= ${t.createdAt}`),
    index('time_capsules_recipient_idx').on(t.recipientId, t.openedAt),
    index('time_capsules_author_sealed_idx')
      .on(t.authorId)
      .where(sql`${t.openedAt} is null`),
    index('time_capsules_due_idx')
      .on(t.openOn)
      .where(sql`${t.openedAt} is null`),
  ],
);
