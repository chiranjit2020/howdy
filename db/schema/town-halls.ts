import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
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
 * - `open`     "Friends can find it" (ADR-054): shown to friends of its members; anyone with its link may join
 * - `invite`   "Private": never listed; reachable only through an invite, which the invitee must accept
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
    /**
     * The one post the owner or a Deputy pinned to the top of the feed (a pinned notice), or null. Cleared when that post
     * is deleted; only a published post of this Town Hall is ever pinned (the service checks).
     */
    pinnedPostId: uuid('pinned_post_id').references((): AnyPgColumn => townHallPosts.id, {
      onDelete: 'set null',
    }),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('town_halls_join_rule_check', sql`${t.joinRule} in ('instant', 'approval')`),
    check('town_halls_name_len', sql`char_length(${t.name}) between 3 and 50`),
    check('town_halls_description_len', sql`char_length(${t.description}) between 1 and 280`),
    check('town_halls_visibility_check', sql`${t.visibility} in ('open', 'invite')`),
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
    // 0 = a photo with no words, as on a wall (2026-11-07). The app requires words OR a photo.
    check('town_hall_posts_body_len', sql`char_length(${t.body}) between 0 and 280`),
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
    check('town_hall_replies_body_len', sql`char_length(${t.body}) between 1 and 280`),
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

/**
 * An event (ADR-056): a group post that is also an invitation, with a name, a start (stored as an instant; shown in
 * Howdy's calendar, Asia/Kolkata) and an optional place. The post carries any details and its replies and reactions;
 * deleting the post deletes the event and every answer to it.
 */
export const townHallEvents = pgTable(
  'town_hall_events',
  {
    postId: uuid('post_id')
      .primaryKey()
      .references(() => townHallPosts.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    startsAt: tstz('starts_at').notNull(),
    place: text('place'),
  },
  (t) => [
    check('town_hall_events_title_len', sql`char_length(${t.title}) between 3 and 80`),
    check('town_hall_events_place_len', sql`${t.place} is null or char_length(${t.place}) between 1 and 80`),
  ],
);

/**
 * One member's answer to an event: going, maybe or can't go (`no`). One per person per event, changeable or taken back.
 * Read-time rules decide what counts: only answers from current active members.
 */
export const townHallRsvps = pgTable(
  'town_hall_rsvps',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => townHallEvents.postId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    answer: text('answer').notNull(),
    answeredAt: tstz('answered_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index('town_hall_rsvps_user_idx').on(t.userId),
    check('town_hall_rsvps_answer_check', sql`${t.answer} in ('going', 'maybe', 'no')`),
  ],
);

/**
 * A poll (ADR-057): a group post whose words are its question, with two to four options. Whoever asked it (or the owner
 * or a Deputy) may close it; then it shows final results. Deleting the post deletes the poll, its options and votes.
 */
export const townHallPolls = pgTable('town_hall_polls', {
  postId: uuid('post_id')
    .primaryKey()
    .references(() => townHallPosts.id, { onDelete: 'cascade' }),
  closedAt: tstz('closed_at'),
});

/** One option of a poll, in the order it was written. */
export const townHallPollOptions = pgTable(
  'town_hall_poll_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => townHallPolls.postId, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    label: text('label').notNull(),
  },
  (t) => [
    uniqueIndex('town_hall_poll_options_order_idx').on(t.postId, t.position),
    check('town_hall_poll_options_label_len', sql`char_length(${t.label}) between 1 and 60`),
    check('town_hall_poll_options_position', sql`${t.position} between 0 and 3`),
  ],
);

/**
 * One member's vote: one per person per poll, changeable or taken back. Nobody is ever shown who voted what; only counts
 * from current active members are shown.
 */
export const townHallPollVotes = pgTable(
  'town_hall_poll_votes',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => townHallPolls.postId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => townHallPollOptions.id, { onDelete: 'cascade' }),
    votedAt: tstz('voted_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index('town_hall_poll_votes_user_idx').on(t.userId),
    index('town_hall_poll_votes_option_idx').on(t.optionId),
  ],
);

/**
 * "Buy or wait?" (ADR-065): a group post that asks the group whether to buy something. The post's words are why the
 * asker wants it; here are the item, its price in whole rupees, an optional alternative ("or I could…"), the asker's ONE
 * update (not a chat), and what they decided. Once decided, answers close. Deleting the post deletes it and every answer.
 */
export const townHallAsks = pgTable(
  'town_hall_asks',
  {
    postId: uuid('post_id')
      .primaryKey()
      .references(() => townHallPosts.id, { onDelete: 'cascade' }),
    item: text('item').notNull(),
    priceRupees: integer('price_rupees').notNull(),
    alternative: text('alternative'),
    note: text('note'),
    notedAt: tstz('noted_at'),
    outcome: text('outcome'),
    decidedAt: tstz('decided_at'),
  },
  (t) => [
    check('town_hall_asks_item_len', sql`char_length(${t.item}) between 2 and 80`),
    check('town_hall_asks_price', sql`${t.priceRupees} between 1 and 10000000`),
    check(
      'town_hall_asks_alternative_len',
      sql`${t.alternative} is null or char_length(${t.alternative}) between 1 and 140`,
    ),
    check('town_hall_asks_note_len', sql`${t.note} is null or char_length(${t.note}) between 1 and 280`),
    check(
      'town_hall_asks_outcome',
      sql`${t.outcome} is null or ${t.outcome} in ('bought', 'waiting', 'skipped')`,
    ),
    check('town_hall_asks_decided_at', sql`(${t.outcome} is null) = (${t.decidedAt} is null)`),
  ],
);

/**
 * One member's answer to a "Buy or wait?": buy or wait, always with a short reason (the reason is the point). One per
 * person per question, changeable or taken back until the asker decides. Members see who said what — it is advice
 * among people who know each other — but only from current active members they have not hidden.
 */
export const townHallAskAnswers = pgTable(
  'town_hall_ask_answers',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => townHallAsks.postId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    verdict: text('verdict').notNull(),
    reason: text('reason').notNull(),
    answeredAt: tstz('answered_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index('town_hall_ask_answers_user_idx').on(t.userId),
    check('town_hall_ask_answers_verdict', sql`${t.verdict} in ('buy', 'wait')`),
    check('town_hall_ask_answers_reason_len', sql`char_length(${t.reason}) between 2 and 140`),
  ],
);
