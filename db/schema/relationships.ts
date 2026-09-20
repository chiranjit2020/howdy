import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Posse link between two users (mutual, unlike a "follow"). One row per pair, stored with the smaller user id in
 * `user_low` so the same pair can never exist twice in two orders. Starts as a request from one side.
 */
export const posseLinks = pgTable(
  'posse_links',
  {
    userLow: uuid('user_low')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userHigh: uuid('user_high')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** requested | accepted | declined. A declined request is kept (silently) so the same person cannot re-ask at once. */
    status: text('status').notNull().default('requested'),
    requestedBy: uuid('requested_by').notNull(),
    /** Each side may privately mark the other as a Close Posse member. Never shown to the other person. */
    lowMarksClose: boolean('low_marks_close').notNull().default(false),
    highMarksClose: boolean('high_marks_close').notNull().default(false),
    createdAt: tstz('created_at').notNull().defaultNow(),
    respondedAt: tstz('responded_at'),
  },
  (t) => [
    primaryKey({ columns: [t.userLow, t.userHigh] }),
    check('posse_links_canonical_order', sql`${t.userLow} < ${t.userHigh}`),
    check('posse_links_status_check', sql`${t.status} in ('requested', 'accepted', 'declined')`),
    check('posse_links_requester_is_a_member', sql`${t.requestedBy} in (${t.userLow}, ${t.userHigh})`),
    // Close flags only make sense on an accepted link.
    check(
      'posse_links_close_needs_accepted',
      sql`${t.status} = 'accepted' or (not ${t.lowMarksClose} and not ${t.highMarksClose})`,
    ),
    index('posse_links_user_high_idx').on(t.userHigh),
    index('posse_links_requested_by_idx').on(t.requestedBy, t.status),
  ],
);

/** Scouting: `scout` watches `scoutee` (one-way). Grants no access; it only says "show me their Fence when it exists". */
export const scouts = pgTable(
  'scouts',
  {
    scoutId: uuid('scout_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scouteeId: uuid('scoutee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.scoutId, t.scouteeId] }),
    check('scouts_not_self', sql`${t.scoutId} <> ${t.scouteeId}`),
    index('scouts_scoutee_idx').on(t.scouteeId),
  ],
);

/**
 * Private, directed controls one user places on another: block (both directions hide, silent), mute (quiet their
 * content), restrict (limit interactions). The target is never told.
 */
export const userControls = pgTable(
  'user_controls',
  {
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.actorId, t.targetId, t.kind] }),
    check('user_controls_not_self', sql`${t.actorId} <> ${t.targetId}`),
    check('user_controls_kind_check', sql`${t.kind} in ('block', 'mute', 'restrict')`),
    // "Has anyone blocked X?" must be fast in both directions.
    index('user_controls_target_kind_idx').on(t.targetId, t.kind),
  ],
);
