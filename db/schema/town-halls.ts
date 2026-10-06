import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
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
    /**
     * How a listed (`open`/`members`) Town Hall is joined (ADR-041): `instant` — one tap; `approval` — ask, and the owner
     * or a Deputy says yes. Invite-only Town Halls ignore it (an invite is always needed).
     */
    joinRule: text('join_rule').notNull().default('instant'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('town_halls_join_rule_check', sql`${t.joinRule} in ('instant', 'approval')`),
    check('town_halls_name_len', sql`char_length(${t.name}) between 3 and 50`),
    check('town_halls_description_len', sql`char_length(${t.description}) between 1 and 280`),
    check('town_halls_visibility_check', sql`${t.visibility} in ('open', 'members', 'invite')`),
    // Keyset pagination for the directory: newest first, ties broken by id.
    index('town_halls_directory_idx').on(t.visibility, t.createdAt.desc(), t.id.desc()),
    index('town_halls_owner_idx').on(t.ownerId),
  ],
);

/**
 * One row per (Town Hall, person). `role` (ADR-041): `owner` (exactly one), `deputy` (appointed by the owner; keeps
 * order) or `member`. `status`:
 * - `active`     a real member (the owner's own row is always `active`, written in the same transaction as the Town Hall)
 * - `invited`    the owner or a Deputy invited this person; they are not a member until they accept (`act('accept')`)
 * - `requested`  this person asked to join a Town Hall that needs approval; staff say yes or no. A "no" only sets
 *                `declined_at`: the asker still sees "Requested" until the request runs out (30 days), then may ask again.
 * At most one `owner` row per Town Hall (a partial unique index); ownership moves only by handing it to a Deputy.
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
    /** Set when staff said no to a join request (never shown to the asker; ADR-041). */
    declinedAt: tstz('declined_at'),
    /**
     * When this person became an active member (ADR-044) — not when they were invited or asked, which `created_at`
     * records. Rows from before it was added fall back to `created_at`. Decides who counts as a Town Hall neighbour.
     */
    joinedAt: tstz('joined_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.townHallId, t.userId] }),
    check('town_hall_members_role_check', sql`${t.role} in ('owner', 'deputy', 'member')`),
    check('town_hall_members_status_check', sql`${t.status} in ('active', 'invited', 'requested')`),
    // Only a real member holds a role: an invite or a request is always a plain `member` row.
    check('town_hall_members_role_needs_active', sql`${t.role} = 'member' or ${t.status} = 'active'`),
    check('town_hall_members_declined_is_request', sql`${t.declinedAt} is null or ${t.status} = 'requested'`),
    // Staff's queue of waiting requests.
    index('town_hall_members_requests_idx')
      .on(t.townHallId, t.createdAt)
      .where(sql`${t.status} = 'requested' and ${t.declinedAt} is null`),
    // The owner's own row is always active: an owner is never merely "invited" to their own Town Hall.
    check('town_hall_members_owner_active', sql`${t.role} <> 'owner' or ${t.status} = 'active'`),
    uniqueIndex('town_hall_members_one_owner_idx')
      .on(t.townHallId)
      .where(sql`${t.role} = 'owner'`),
    index('town_hall_members_user_idx').on(t.userId, t.status),
  ],
);

/**
 * Who may not join a Town Hall (ADR-042). Set by the owner or a Deputy; lasts until lifted, or until the Town Hall or the
 * banned person's account is deleted. A ban is never announced: to the banned person the Town Hall looks like one that
 * needs approval, and "asking" only sets `asked_at` here — they see "Requested" until it runs out (30 days), exactly as
 * after a quiet "no". Kept apart from `town_hall_members` on purpose: any membership row makes an invite-only Town Hall
 * visible to its person.
 */
export const townHallBans = pgTable(
  'town_hall_bans',
  {
    townHallId: uuid('town_hall_id')
      .notNull()
      .references(() => townHalls.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Which member of staff set it (shown to staff). Kept if that account is deleted. */
    bannedBy: uuid('banned_by').references(() => users.id, { onDelete: 'set null' }),
    /** When the banned person last "asked to join" (what drives their "Requested"); never shown to staff. */
    askedAt: tstz('asked_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.townHallId, t.userId] }),
    index('town_hall_bans_user_idx').on(t.userId),
    index('town_hall_bans_by_idx').on(t.bannedBy),
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
    /** Set when this post is a Time Capsule that opened (ADR-043): when its words were sealed. */
    capsuleSealedAt: tstz('capsule_sealed_at'),
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

/**
 * A Time Capsule sealed for a whole Town Hall (ADR-043) by its owner or a Deputy. Sealed means sealed for everyone, the
 * writer included: no read selects `body` here. On its day (Howdy's calendar, Asia/Kolkata) it becomes a post in the feed
 * (`town_hall_posts.capsule_sealed_at` set) and this row is deleted in the same transaction — even if the writer has left
 * or been banned since. Goes with the Town Hall or the writer's account.
 */
export const townHallCapsules = pgTable(
  'town_hall_capsules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    townHallId: uuid('town_hall_id')
      .notNull()
      .references(() => townHalls.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    openOn: date('open_on', { mode: 'string' }).notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    // It becomes a post, so it obeys the post's length.
    check('town_hall_capsules_body_len', sql`char_length(${t.body}) between 1 and 280`),
    index('town_hall_capsules_hall_idx').on(t.townHallId, t.openOn),
    index('town_hall_capsules_due_idx').on(t.openOn),
    index('town_hall_capsules_author_idx').on(t.authorId),
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
