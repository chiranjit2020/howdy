import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Post Card nailed to someone's Fence (their Ranch's public wall). Deleting either the Fence owner or the author removes
 * the card (and its replies and Yos with it) — see docs/DATA_LIFECYCLE.md. Status:
 * - `published`  visible to everyone who may read the Fence
 * - `pending`    the owner turned Review on; waits for approval and says so to its author ("waiting for approval")
 * - `held`       the author is Restricted by the owner; waits for approval but looks posted to its author (never told)
 * Non-published cards are visible only to their author and the Fence owner.
 */
export const postCards = pgTable(
  'post_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fenceOwnerId: uuid('fence_owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: text('status').notNull().default('published'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('post_cards_body_len', sql`char_length(${t.body}) between 1 and 160`),
    check('post_cards_status_check', sql`${t.status} in ('published', 'pending', 'held')`),
    // Keyset pagination: newest first, ties broken by id.
    index('post_cards_fence_page_idx').on(t.fenceOwnerId, t.status, t.createdAt.desc(), t.id.desc()),
    index('post_cards_author_idx').on(t.authorId),
  ],
);

/** A reply ("scribble") on the back of a Post Card. Same hold-for-approval rule as cards. */
export const cardReplies = pgTable(
  'card_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => postCards.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: text('status').notNull().default('published'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('card_replies_body_len', sql`char_length(${t.body}) between 1 and 80`),
    check('card_replies_status_check', sql`${t.status} in ('published', 'pending', 'held')`),
    index('card_replies_card_idx').on(t.cardId, t.createdAt, t.id),
    index('card_replies_author_idx').on(t.authorId),
  ],
);

/** A Yo: one per person per card. Not a generic reaction — it is its own interaction. */
export const yos = pgTable(
  'yos',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => postCards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.userId] }), index('yos_user_idx').on(t.userId)],
);
