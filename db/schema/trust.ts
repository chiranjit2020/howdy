import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * The Trusted tick: the last time the trust module checked a person against its checklist, and whether they passed.
 * One row per person once they have been checked. It is a cache of a decision, not a score: nothing here says WHY a
 * person passed or failed (the owner's own checklist is recomputed live), so the row can be rebuilt at any time.
 * Deleting the person removes it.
 */
export const trustTicks = pgTable(
  'trust_ticks',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** When the person first passed every check in their current run; null while they do not have the tick. */
    earnedAt: tstz('earned_at'),
    checkedAt: tstz('checked_at').notNull().defaultNow(),
  },
  // The daily job re-checks the oldest checks first.
  (t) => [index('trust_ticks_checked_idx').on(t.checkedAt)],
);
