import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Tribute: a Posse member's public testimonial on someone's Ranch. Unlike a Post Card, EVERY Tribute waits for the
 * owner's approval before anyone else can read it — there is no fast path, so approving one never reveals anything about
 * how the owner regards its author (see docs/DATA_LIFECYCLE.md). At most one PUBLISHED Tribute per owner may be pinned.
 * Deleting either person removes it.
 */
export const tributes = pgTable(
  'tributes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: text('status').notNull().default('pending'),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('tributes_not_self', sql`${t.ownerId} <> ${t.authorId}`),
    check('tributes_status_check', sql`${t.status} in ('pending', 'published')`),
    check('tributes_body_len', sql`char_length(${t.body}) between 1 and 280`),
    // Only a published Tribute may be pinned, and only one at a time per owner.
    check('tributes_pinned_published', sql`not ${t.pinned} or ${t.status} = 'published'`),
    uniqueIndex('tributes_one_pinned_per_owner_idx')
      .on(t.ownerId)
      .where(sql`${t.pinned}`),
    // Keyset pagination: newest first, ties broken by id.
    index('tributes_owner_page_idx').on(t.ownerId, t.status, t.createdAt.desc(), t.id.desc()),
    index('tributes_author_idx').on(t.authorId),
  ],
);
