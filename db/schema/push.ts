import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sessions, users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * One device that asked for notifications while Howdy is closed (Web Push). Bound to the SESSION that subscribed, not just the
 * person: pushes go only to devices whose session is still live, so logging out, "log out everywhere" and session expiry
 * silence a phone at once, and a shared phone never shows the previous person's Chimes. Deleted with the session or the person.
 * `endpoint` is the push service's address for this browser (an allowlisted host, see shared/validation/push.ts).
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('push_endpoint_https', sql`${t.endpoint} ~ '^https://' and char_length(${t.endpoint}) <= 1024`),
    check('push_keys_len', sql`char_length(${t.p256dh}) <= 100 and char_length(${t.auth}) <= 32`),
    index('push_user_idx').on(t.userId),
    index('push_session_idx').on(t.sessionId),
  ],
);
