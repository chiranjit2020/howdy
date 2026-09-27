import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Who agreed to which version of the Terms / Privacy Policy, and when (src/shared/legal.ts holds the versions).
 * Append-only: agreeing to a new version adds a row, the old ones stay as the history. Deleted with the account
 * (cascade) — once the account is gone there is no agreement left to evidence.
 */
export const legalAcceptances = pgTable(
  'legal_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    document: text('document').notNull(),
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('legal_acceptances_document_check', sql`${t.document} in ('terms', 'privacy')`),
    check('legal_acceptances_version_check', sql`${t.version} ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'`),
    // Agreeing to the same version twice is a no-op, so the history stays one row per version.
    uniqueIndex('legal_acceptances_once').on(t.userId, t.document, t.version),
  ],
);
