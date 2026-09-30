import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * "Not now" on a Pal suggestion (Phase 13, ADR-029): that person is never suggested to me again. Private to me; the
 * other person is never told. Deleted with either account.
 */
export const suggestionDismissals = pgTable(
  'suggestion_dismissals',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dismissedId: uuid('dismissed_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.dismissedId] }),
    index('suggestion_dismissals_dismissed_idx').on(t.dismissedId),
  ],
);
