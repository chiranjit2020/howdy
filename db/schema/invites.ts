import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A member's personal invite link (ADR-045): one per person, made the first time they ask for it. Resetting it gives a
 * new code, and the old link stops working at once. Deleted with the account.
 */
export const inviteLinks = pgTable(
  'invite_links',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [check('invite_links_code_format', sql`${t.code} ~ '^[A-Za-z0-9]{10}$'`)],
);

/**
 * Someone who signed up through a member's link (ADR-045). When they confirm their email, a Pal request goes from them to
 * the inviter (`redeemed_at` set); nothing else is granted. Rows are deleted 30 days after sign-up, redeemed or not —
 * long enough for the weekly cap per link, which counts them. Deleted with either account.
 */
export const invitations = pgTable(
  'invitations',
  {
    inviteeId: uuid('invitee_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    inviterId: uuid('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
    redeemedAt: tstz('redeemed_at'),
  },
  (t) => [
    check('invitations_not_self', sql`${t.inviteeId} <> ${t.inviterId}`),
    // The weekly cap counts an inviter's recent sign-ups.
    index('invitations_inviter_idx').on(t.inviterId, t.createdAt),
  ],
);
