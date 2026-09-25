import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Mark: one Posse member's "deep vibe" award to another (Chill / Pure / Cinema / Sigma / Gem — master prompt Phase 9).
 * An append-only log, so a Ranch's Vibe Matrix reflects everything ever given, but a rater may give one target only ONE
 * Mark — any kind — per 30 days; that cooldown is checked at write time from the most recent row for the pair (a database
 * constraint cannot express a rolling window). Nobody but the target ever sees who gave a Mark or which kind: the Ranch
 * shows only the aggregate breakdown (no cross-person leaderboard — see PRODUCT_DISCOVERY.md C11). Deleting either person
 * removes their Marks.
 */
export const marks = pgTable(
  'marks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    raterId: uuid('rater_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('marks_not_self', sql`${t.raterId} <> ${t.targetId}`),
    check('marks_kind_check', sql`${t.kind} in ('chill', 'pure', 'cinema', 'sigma', 'gem')`),
    // The cooldown check reads the rater's most recent Mark to this target.
    index('marks_pair_recent_idx').on(t.raterId, t.targetId, t.createdAt.desc()),
    // The Vibe Matrix breakdown counts a target's Marks per kind.
    index('marks_target_kind_idx').on(t.targetId, t.kind),
  ],
);
