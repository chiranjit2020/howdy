import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, timestamp, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { asks } from './asks';
import { postCards } from './fence';
import { townHallPosts } from './town-halls';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Chime (notification). Stores WHO did WHAT and to which card — never text and never a copy of anyone's words — so what a
 * Chime says, and whether it is shown at all, is decided when it is read, from the current state (a later block or mute makes
 * it vanish). Deleted with either person or with the card it is about (see docs/DATA_LIFECYCLE.md).
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    cardId: uuid('card_id').references(() => postCards.id, { onDelete: 'cascade' }),
    /** Set only for Town Hall feed Chimes (ADR-033): the post replied to or reacted to. */
    hallPostId: uuid('hall_post_id').references(() => townHallPosts.id, { onDelete: 'cascade' }),
    /** Set only for public "Buy or wait?" Chimes (ADR-066): the question asked or answered. */
    askId: uuid('ask_id').references(() => asks.id, { onDelete: 'cascade' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
    readAt: tstz('read_at'),
  },
  (t) => [
    check(
      'notifications_type_check',
      sql`${t.type} in ('posse_requested', 'posse_accepted', 'card_created', 'card_waiting', 'card_approved', 'reply_created', 'reply_waiting', 'yo_given', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened', 'hall_reply_created', 'hall_reaction_given', 'townhall_join_requested', 'townhall_request_approved', 'townhall_made_deputy', 'townhall_made_owner', 'story_reacted', 'hall_ask_created', 'hall_ask_answered', 'ask_created', 'ask_answered')`,
    ),
    // A Time Capsule to yourself is the one Chime whose sender is its recipient (Phase 12, ADR-028).
    check('notifications_not_self', sql`${t.recipientId} <> ${t.actorId} or ${t.type} = 'capsule_opened'`),
    // Person-shaped and Town Hall feed Chimes have no card; every card/reply/Yo Chime is about one. Feed Chimes are about
    // a post instead (ADR-033).
    check(
      'notifications_card_iff_card_type',
      sql`(${t.type} in ('posse_requested', 'posse_accepted', 'whisper_received', 'tribute_waiting', 'tribute_approved', 'mark_given', 'townhall_invited', 'townhall_invite_accepted', 'capsule_opened', 'hall_reply_created', 'hall_reaction_given', 'townhall_join_requested', 'townhall_request_approved', 'townhall_made_deputy', 'townhall_made_owner', 'story_reacted', 'hall_ask_created', 'hall_ask_answered', 'ask_created', 'ask_answered')) = (${t.cardId} is null)`,
    ),
    check(
      'notifications_hall_post_iff_hall_type',
      sql`(${t.type} in ('hall_reply_created', 'hall_reaction_given', 'hall_ask_created', 'hall_ask_answered')) = (${t.hallPostId} is not null)`,
    ),
    check(
      'notifications_ask_iff_ask_type',
      sql`(${t.type} in ('ask_created', 'ask_answered')) = (${t.askId} is not null)`,
    ),
    // One Chime per person per thing: a repeat (switching a Yo off and on, a second reply) cannot ring the bell again.
    uniqueIndex('notifications_once_per_card')
      .on(t.recipientId, t.actorId, t.type, t.cardId)
      .where(sql`${t.cardId} is not null`),
    uniqueIndex('notifications_once_per_hall_post')
      .on(t.recipientId, t.actorId, t.type, t.hallPostId)
      .where(sql`${t.hallPostId} is not null`),
    uniqueIndex('notifications_once_per_ask')
      .on(t.recipientId, t.actorId, t.type, t.askId)
      .where(sql`${t.askId} is not null`),
    uniqueIndex('notifications_once_per_person')
      .on(t.recipientId, t.actorId, t.type)
      .where(sql`${t.cardId} is null and ${t.hallPostId} is null and ${t.askId} is null`),
    index('notifications_page_idx').on(t.recipientId, t.createdAt.desc(), t.id.desc()),
    index('notifications_unread_idx')
      .on(t.recipientId, t.createdAt.desc())
      .where(sql`${t.readAt} is null`),
    index('notifications_card_idx').on(t.cardId),
    index('notifications_hall_post_idx').on(t.hallPostId),
    index('notifications_ask_idx').on(t.askId),
    index('notifications_actor_idx').on(t.actorId),
  ],
);

/**
 * When the person last opened their notifications (2026-11-03). The bell counts only unread Chimes newer than this, so
 * opening the page clears the number while each Chime stays unread until it is opened or marked. No row = never opened
 * (everything unread counts).
 */
export const notificationSeen = pgTable('notification_seen', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  seenAt: tstz('seen_at').notNull(),
});

/** Which kinds of Chime a person wants. No row = everything on. */
export const notificationPrefs = pgTable('notification_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  posse: boolean('posse').notNull().default(true),
  fence: boolean('fence').notNull().default(true),
  replies: boolean('replies').notNull().default(true),
  yo: boolean('yo').notNull().default(true),
  whispers: boolean('whispers').notNull().default(true),
  tributes: boolean('tributes').notNull().default(true),
  townhalls: boolean('townhalls').notNull().default(true),
  capsules: boolean('capsules').notNull().default(true),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});
