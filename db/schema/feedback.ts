import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * Feedback about Howdy itself (ADR-059), sent from /feedback: what kind, the words, and the page it was about. Read by
 * admins in the Control Room. Deleted with the account, and a year after it was sent (the purge job).
 */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    body: text('body').notNull(),
    /** The in-app path it was sent from ("/home"), if any. Never a query string. */
    page: text('page'),
    status: text('status').notNull().default('new'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    handledAt: tstz('handled_at'),
  },
  (t) => [
    check('feedback_kind_check', sql`${t.kind} in ('idea', 'broken', 'other')`),
    check('feedback_status_check', sql`${t.status} in ('new', 'read', 'done')`),
    check('feedback_body_len', sql`char_length(${t.body}) between 1 and 1000`),
    check('feedback_page_check', sql`${t.page} is null or ${t.page} ~ '^/([A-Za-z0-9_.@-][A-Za-z0-9/_.@-]{0,198})?$'`),
    index('feedback_created_idx').on(t.createdAt.desc()),
    index('feedback_user_idx').on(t.userId),
  ],
);
