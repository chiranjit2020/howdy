import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Town Hall (community): name, description and a visibility that governs who may find and join it.
 * - `open`     any active member may join instantly; listed in the directory
 * - `members`  any active member may join instantly (same as open); listed in the directory — the distinct label is
 *              for the owner's messaging, not a different join rule
 * - `invite`   never listed; reachable only through an invite from the owner, which the invitee must accept
 * Members share a post feed (`town_hall_posts`, ADR-033; ADR-017 for the rest). Deleting the owner deletes the whole
 * Town Hall (no ownership transfer yet); deleting any other member just removes their row.
 */
export const townHalls = pgTable(
  'town_halls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    visibility: text('visibility').notNull().default('open'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('town_halls_name_len', sql`char_length(${t.name}) between 3 and 50`),
    check('town_halls_description_len', sql`char_length(${t.description}) between 1 and 280`),
    check('town_halls_visibility_check', sql`${t.visibility} in ('open', 'members', 'invite')`),
    // Keyset pagination for the directory: newest first, ties broken by id.
    index('town_halls_directory_idx').on(t.visibility, t.createdAt.desc(), t.id.desc()),
    index('town_halls_owner_idx').on(t.ownerId),
  ],
);

/**
 * One row per (Town Hall, person). `status`:
 * - `active`   a real member (the owner's own row is always `active`, written in the same transaction as the Town Hall)
 * - `invited`  the owner invited this person; they are not a member until they accept (`act('accept')`)
 * At most one `owner` row per Town Hall (a partial unique index — ownership never transfers in this phase).
 */
export const townHallMembers = pgTable(
  'town_hall_members',
  {
    townHallId: uuid('town_hall_id')
      .notNull()
      .references(() => townHalls.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    status: text('status').notNull().default('active'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.townHallId, t.userId] }),
    check('town_hall_members_role_check', sql`${t.role} in ('owner', 'member')`),
    check('town_hall_members_status_check', sql`${t.status} in ('active', 'invited')`),
    // The owner's own row is always active: an owner is never merely "invited" to their own Town Hall.
    check('town_hall_members_owner_active', sql`${t.role} <> 'owner' or ${t.status} = 'active'`),
    uniqueIndex('town_hall_members_one_owner_idx')
      .on(t.townHallId)
      .where(sql`${t.role} = 'owner'`),
    index('town_hall_members_user_idx').on(t.userId, t.status),
  ],
);

/**
 * A post in a Town Hall's shared feed (ADR-033). Only active members read or write the feed. Deleting the Town Hall or
 * the author removes the post (and its replies and reactions with it). Status:
 * - `published`  visible to every active member
 * - `held`       the author has open reports from several people lately (ADR-024); waits for the owner's OK but looks
 *                posted to its author (never told)
 * Leaving a Town Hall keeps what you posted there; the owner (or you) can still take it down.
 */
export const townHallPosts = pgTable(
  'town_hall_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    townHallId: uuid('town_hall_id')
      .notNull()
      .references(() => townHalls.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: text('status').notNull().default('published'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('town_hall_posts_body_len', sql`char_length(${t.body}) between 1 and 280`),
    check('town_hall_posts_status_check', sql`${t.status} in ('published', 'held')`),
    // Keyset pagination: newest first, ties broken by id.
    index('town_hall_posts_feed_idx').on(t.townHallId, t.status, t.createdAt.desc(), t.id.desc()),
    index('town_hall_posts_author_idx').on(t.authorId),
  ],
);

/** A reply on a Town Hall post. Same hold rule as posts; capped per post like a Post Card's scribbles. */
export const townHallReplies = pgTable(
  'town_hall_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => townHallPosts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: text('status').notNull().default('published'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('town_hall_replies_body_len', sql`char_length(${t.body}) between 1 and 80`),
    check('town_hall_replies_status_check', sql`${t.status} in ('published', 'held')`),
    index('town_hall_replies_post_idx').on(t.postId, t.createdAt, t.id),
    index('town_hall_replies_author_idx').on(t.authorId),
  ],
);

/** A reaction to a Town Hall post: one per person per post, the same five kinds as Post Cards. Counts only are shown. */
export const townHallReactions = pgTable(
  'town_hall_reactions',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => townHallPosts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('yo'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index('town_hall_reactions_user_idx').on(t.userId),
    check('town_hall_reactions_kind_check', sql`${t.kind} in ('yo', 'laugh', 'fire', 'popcorn', 'love')`),
  ],
);
