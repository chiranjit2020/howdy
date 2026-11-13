import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A public "Buy or wait?" (ADR-066): a question about something the asker wants to buy, asked outside any group.
 * `audience`:
 * - `friends`   the asker's friends (decided when read: someone who stops being a friend stops seeing it)
 * - `everyone`  every signed-in person, on the Buy or wait page; its link opens for anyone, signed in or not
 * `status` follows the post rules (ADR-024): a `held` question shows only to its asker (who is never told) and is
 * dropped after 30 days. Group questions are separate (`town_hall_asks`, ADR-065): they belong to the group's feed.
 */
export const asks = pgTable(
  'asks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    audience: text('audience').notNull(),
    item: text('item').notNull(),
    priceRupees: integer('price_rupees').notNull(),
    why: text('why').notNull(),
    alternative: text('alternative'),
    note: text('note'),
    notedAt: tstz('noted_at'),
    outcome: text('outcome'),
    decidedAt: tstz('decided_at'),
    status: text('status').notNull().default('published'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('asks_audience', sql`${t.audience} in ('friends', 'everyone')`),
    check('asks_status', sql`${t.status} in ('published', 'held')`),
    check('asks_item_len', sql`char_length(${t.item}) between 2 and 80`),
    check('asks_price', sql`${t.priceRupees} between 1 and 10000000`),
    check('asks_why_len', sql`char_length(${t.why}) between 3 and 280`),
    check(
      'asks_alternative_len',
      sql`${t.alternative} is null or char_length(${t.alternative}) between 1 and 140`,
    ),
    check('asks_note_len', sql`${t.note} is null or char_length(${t.note}) between 1 and 280`),
    check('asks_outcome', sql`${t.outcome} is null or ${t.outcome} in ('bought', 'waiting', 'skipped')`),
    check('asks_decided_at', sql`(${t.outcome} is null) = (${t.decidedAt} is null)`),
    // The public list (newest first) and each person's own questions.
    index('asks_list_idx').on(t.audience, t.status, t.createdAt.desc(), t.id.desc()),
    index('asks_author_idx').on(t.authorId, t.createdAt.desc()),
  ],
);

/**
 * One person's answer: buy or wait, always with a reason. One per person per question, changeable or taken back until
 * the asker decides. Whoever can see the question sees who answered what (minus people they have hidden).
 */
export const askAnswers = pgTable(
  'ask_answers',
  {
    askId: uuid('ask_id')
      .notNull()
      .references(() => asks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    verdict: text('verdict').notNull(),
    reason: text('reason').notNull(),
    answeredAt: tstz('answered_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.askId, t.userId] }),
    index('ask_answers_user_idx').on(t.userId),
    check('ask_answers_verdict', sql`${t.verdict} in ('buy', 'wait')`),
    check('ask_answers_reason_len', sql`char_length(${t.reason}) between 2 and 140`),
  ],
);
