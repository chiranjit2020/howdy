import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * A user report ("Flag trouble"). Foundation for the Phase 11 moderation queue. Both user links use SET NULL, not
 * CASCADE: evidence must outlive either account (see docs/DATA_LIFECYCLE.md), while the identifiers go.
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
    status: text('status').notNull().default('open'),
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
    // One open report per reporter/target: repeating it is a no-op, and cannot be used to flood the queue.
    uniqueIndex('reports_one_open_per_pair')
      .on(t.reporterId, t.targetUserId)
      .where(sql`${t.status} = 'open'`),
    index('reports_status_created_idx').on(t.status, t.createdAt),
  ],
);
