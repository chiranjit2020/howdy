import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Whisper thread between exactly two people. One row per pair, stored with the smaller user id in `user_low` so the same pair
 * can never have two threads. `last_seq` numbers the messages 1, 2, 3… inside the thread (assigned under a row lock), which is
 * what makes reconnect sync and duplicate-safe delivery possible. Each side keeps how far THEY have read; the other person
 * sees it as "Seen" only when both have read receipts on and nobody's words are held (ADR-021).
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userLow: uuid('user_low')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userHigh: uuid('user_high')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastSeq: bigint('last_seq', { mode: 'number' }).notNull().default(0),
    lowReadSeq: bigint('low_read_seq', { mode: 'number' }).notNull().default(0),
    highReadSeq: bigint('high_read_seq', { mode: 'number' }).notNull().default(0),
    /**
     * "Burn for me" (ADR-038): when someone who has been blocked or restricted burns the thread, it is not deleted; it is
     * cleared for THEM up to this position, so the other person keeps their thread and held tray. Everything the burner sees
     * is numbered from here, so their view is the same as after a real burn.
     */
    lowClearedSeq: bigint('low_cleared_seq', { mode: 'number' }).notNull().default(0),
    highClearedSeq: bigint('high_cleared_seq', { mode: 'number' }).notNull().default(0),
    createdAt: tstz('created_at').notNull().defaultNow(),
    lastMessageAt: tstz('last_message_at').notNull().defaultNow(),
  },
  (t) => [
    check('conversations_canonical_order', sql`${t.userLow} < ${t.userHigh}`),
    check(
      'conversations_read_within_bounds',
      sql`${t.lowReadSeq} between 0 and ${t.lastSeq} and ${t.highReadSeq} between 0 and ${t.lastSeq}`,
    ),
    check(
      'conversations_cleared_within_bounds',
      sql`${t.lowClearedSeq} between 0 and ${t.lastSeq} and ${t.highClearedSeq} between 0 and ${t.lastSeq}`,
    ),
    uniqueIndex('conversations_pair_idx').on(t.userLow, t.userHigh),
    index('conversations_high_idx').on(t.userHigh),
    index('conversations_low_activity_idx').on(t.userLow, t.lastMessageAt.desc()),
    index('conversations_high_activity_idx').on(t.userHigh, t.lastMessageAt.desc()),
  ],
);

/**
 * One Whisper (max 280 characters). Deleted with the thread ("Burn Thread"), with either person, and after 7 days. `client_id`
 * is chosen by the sender's device and makes sending idempotent: a retry after a dropped connection returns the same message
 * instead of a second one. Status `held`: the sender is Restricted by the recipient — it looks sent to the sender and is never
 * shown to the recipient.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    clientId: text('client_id').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull().default('sent'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('messages_body_len', sql`char_length(${t.body}) between 1 and 280`),
    check('messages_status_check', sql`${t.status} in ('sent', 'held')`),
    check('messages_client_id_shape', sql`${t.clientId} ~ '^[0-9a-f-]{36}$'`),
    check('messages_seq_positive', sql`${t.seq} > 0`),
    uniqueIndex('messages_seq_idx').on(t.conversationId, t.seq),
    uniqueIndex('messages_idempotency_idx').on(t.conversationId, t.senderId, t.clientId),
    index('messages_created_idx').on(t.createdAt),
    index('messages_sender_idx').on(t.senderId),
  ],
);
