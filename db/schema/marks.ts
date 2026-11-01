import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Mark (ADR-052): the one word a friend (or group neighbour) picks to describe someone — Gem / Pure / Chill / Sharp /
 * Bold, personality traits, not reactions to a post. ONE current pick per rater -> target, changeable any time (the
 * database enforces one row per pair); taking it back deletes it. A profile shows only the top words ("Friends say:
 * Chill · Sharp"), never counts and never who picked what (no leaderboard — see PRODUCT_DISCOVERY.md C11). Deleting
 * either person removes their Marks.
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
    /**
     * Were the two Pals when it was given (ADR-044)? Town Hall neighbours may give Marks too, but only Pals' Marks count
     * toward the Trusted tick. No default on purpose: every insert must say which it is.
     */
    fromPal: boolean('from_pal').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('marks_not_self', sql`${t.raterId} <> ${t.targetId}`),
    check('marks_kind_check', sql`${t.kind} in ('gem', 'pure', 'chill', 'sharp', 'bold')`),
    // One current pick per rater -> target: changing it updates the row.
    uniqueIndex('marks_one_per_pair_idx').on(t.raterId, t.targetId),
    // The top words count a target's picks per kind.
    index('marks_target_kind_idx').on(t.targetId, t.kind),
  ],
);
