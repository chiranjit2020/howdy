import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { postCards } from './fence';
import { media } from './media';
import { townHallPosts, townHalls } from './town-halls';
import { messages } from './whispers';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A user report ("Flag trouble") and, from Phase 11, the moderation queue's own record of what happened to it.
 * `reporterId` and `targetUserId` use SET NULL, not CASCADE: evidence must outlive either account (see
 * docs/DATA_LIFECYCLE.md), while the identifiers go. `cardId` also SET NULLs — removing the reported card (the
 * moderator action) must not delete the report that led to it, and the report keeps `evidenceText` regardless.
 * `subject` says what the report is about (ADR-025); each kind of thing has its own SET NULL pointer, set only for it.
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    /** person | card | portrait | whisper | town_hall | hall_post. */
    subject: text('subject').notNull().default('person'),
    details: text('details'),
    /** Snapshot of the reported words (a card, a Whisper, a Town Hall's name and description): evidence outlives them. */
    evidenceText: text('evidence_text'),
    /** Set only when the report is about a specific Post Card, so a moderator can act on that card directly. */
    cardId: uuid('card_id').references(() => postCards.id, { onDelete: 'set null' }),
    /** The exact Portrait reported (a newer photo is not the one that was reported). */
    mediaId: uuid('media_id').references(() => media.id, { onDelete: 'set null' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    townHallId: uuid('town_hall_id').references(() => townHalls.id, { onDelete: 'set null' }),
    /** A post in a Town Hall's feed (ADR-033). */
    hallPostId: uuid('hall_post_id').references(() => townHallPosts.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('open'),
    /** Who last changed the status, and when. Full history of moderator actions lives in `audit_log`. */
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: tstz('reviewed_at'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'reports_reason_check',
      sql`${t.reason} in ('harassment', 'spam', 'impersonation', 'inappropriate', 'other')`,
    ),
    check('reports_status_check', sql`${t.status} in ('open', 'reviewing', 'actioned', 'dismissed')`),
    check('reports_details_len', sql`${t.details} is null or char_length(${t.details}) <= 500`),
    check('reports_evidence_len', sql`${t.evidenceText} is null or char_length(${t.evidenceText}) <= 600`),
    check(
      'reports_subject_check',
      sql`${t.subject} in ('person', 'card', 'portrait', 'whisper', 'town_hall', 'hall_post')`,
    ),
    check(
      'reports_not_self',
      sql`${t.reporterId} is distinct from ${t.targetUserId} or ${t.reporterId} is null`,
    ),
    // No reviewed-by/reviewed-at pairing CHECK: deleting the reviewing moderator's account SET NULLs `reviewedBy`
    // alone (via FK), which must not break — `reviewedAt` stays as the historical fact that it WAS reviewed, just by
    // someone no longer identifiable. The application always writes both together.
    // One open report per reporter/target/kind of thing: repeating it is a no-op, and cannot flood the queue.
    uniqueIndex('reports_one_open_per_pair')
      .on(t.reporterId, t.targetUserId, t.subject)
      .where(sql`${t.status} = 'open'`),
    index('reports_status_created_idx').on(t.status, t.createdAt),
    index('reports_card_idx').on(t.cardId),
    // Auto-hold (ADR-024) counts the open reports against one person on every card they write on another Fence.
    index('reports_open_target_idx')
      .on(t.targetUserId, t.createdAt)
      .where(sql`${t.status} = 'open'`),
  ],
);

/**
 * One suspension of an account (Phase 11, ADR-023). `users.status = 'suspended'` stays the single thing every gate
 * checks; this row says why, until when, and carries the person's one appeal. At most one row per person is live
 * (`lifted_at is null`), and it exists exactly when the account is suspended. Rows go with the account (CASCADE) —
 * the audit trail keeps the history of who did what.
 */
export const suspensions = pgTable(
  'suspensions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Shown to the suspended person, so it is one of a closed set — never a moderator's free text. */
    reason: text('reason').notNull(),
    /** Null = until a moderator lifts it. A timed one lifts itself at the next sign-in (or the nightly job). */
    endsAt: tstz('ends_at'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    reportId: uuid('report_id').references(() => reports.id, { onDelete: 'set null' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
    liftedAt: tstz('lifted_at'),
    liftedBy: uuid('lifted_by').references(() => users.id, { onDelete: 'set null' }),
    /** reinstated (by hand) | expired (its time ran out) | appeal (an appeal was granted). */
    liftCause: text('lift_cause'),
    appealText: text('appeal_text'),
    appealedAt: tstz('appealed_at'),
    /** open | upheld (the suspension stands) | granted (it was lifted). Null until the person appeals. */
    appealStatus: text('appeal_status'),
    appealReviewedBy: uuid('appeal_reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    appealReviewedAt: tstz('appeal_reviewed_at'),
  },
  (t) => [
    check(
      'suspensions_reason_check',
      sql`${t.reason} in ('harassment', 'spam', 'impersonation', 'inappropriate', 'other')`,
    ),
    check('suspensions_ends_after_start', sql`${t.endsAt} is null or ${t.endsAt} > ${t.createdAt}`),
    check(
      'suspensions_lift_cause_check',
      sql`${t.liftCause} is null or ${t.liftCause} in ('reinstated', 'expired', 'appeal')`,
    ),
    check('suspensions_lift_pair', sql`(${t.liftedAt} is null) = (${t.liftCause} is null)`),
    check(
      'suspensions_appeal_status_check',
      sql`${t.appealStatus} is null or ${t.appealStatus} in ('open', 'upheld', 'granted')`,
    ),
    check(
      'suspensions_appeal_pair',
      sql`(${t.appealText} is null) = (${t.appealedAt} is null) and (${t.appealText} is null) = (${t.appealStatus} is null)`,
    ),
    check('suspensions_appeal_len', sql`${t.appealText} is null or char_length(${t.appealText}) <= 500`),
    uniqueIndex('suspensions_one_live_per_user')
      .on(t.userId)
      .where(sql`${t.liftedAt} is null`),
    index('suspensions_open_appeals_idx')
      .on(t.appealedAt, t.id)
      .where(sql`${t.appealStatus} = 'open'`),
    index('suspensions_timed_idx')
      .on(t.endsAt)
      .where(sql`${t.liftedAt} is null and ${t.endsAt} is not null`),
  ],
);
