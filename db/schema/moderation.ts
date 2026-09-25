import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { postCards } from './fence';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A user report ("Flag trouble") and, from Phase 11, the moderation queue's own record of what happened to it.
 * `reporterId` and `targetUserId` use SET NULL, not CASCADE: evidence must outlive either account (see
 * docs/DATA_LIFECYCLE.md), while the identifiers go. `cardId` also SET NULLs — removing the reported card (the
 * moderator action) must not delete the report that led to it, and the report keeps `evidenceText` regardless.
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    details: text('details'),
    /** Snapshot of a Post Card's text when the report was about a card, so the evidence outlives the card. */
    evidenceText: text('evidence_text'),
    /** Set only when the report is about a specific Post Card, so a moderator can act on that card directly. */
    cardId: uuid('card_id').references(() => postCards.id, { onDelete: 'set null' }),
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
    check('reports_evidence_len', sql`${t.evidenceText} is null or char_length(${t.evidenceText}) <= 160`),
    check(
      'reports_not_self',
      sql`${t.reporterId} is distinct from ${t.targetUserId} or ${t.reporterId} is null`,
    ),
    // No reviewed-by/reviewed-at pairing CHECK: deleting the reviewing moderator's account SET NULLs `reviewedBy`
    // alone (via FK), which must not break — `reviewedAt` stays as the historical fact that it WAS reviewed, just by
    // someone no longer identifiable. The application always writes both together.
    // One open report per reporter/target: repeating it is a no-op, and cannot be used to flood the queue.
    uniqueIndex('reports_one_open_per_pair')
      .on(t.reporterId, t.targetUserId)
      .where(sql`${t.status} = 'open'`),
    index('reports_status_created_idx').on(t.status, t.createdAt),
    index('reports_card_idx').on(t.cardId),
  ],
);
