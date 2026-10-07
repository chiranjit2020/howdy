import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Story (ADR-047): one photo, an optional short caption, seen by my Pals (or only my Close Pals) for 12 hours. The
 * photo is a `media` row pointing here (`media.story_id`). Past `expires_at` it is gone everywhere; the daily job deletes
 * the row (views and reactions with it) and the photo's file. Deleted with the account.
 */
export const stories = pgTable(
  'stories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** pals | close — close means only the Pals I privately marked as Close (like the Porch Light). */
    audience: text('audience').notNull(),
    caption: text('caption'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
  },
  (t) => [
    check('stories_audience_check', sql`${t.audience} in ('pals', 'close')`),
    check('stories_caption_len', sql`${t.caption} is null or char_length(${t.caption}) between 1 and 80`),
    check(
      'stories_twelve_hours',
      sql`${t.expiresAt} > ${t.createdAt} and ${t.expiresAt} <= ${t.createdAt} + interval '12 hours'`,
    ),
    index('stories_author_expires_idx').on(t.authorId, t.expiresAt),
    index('stories_expires_idx').on(t.expiresAt),
  ],
);

/**
 * Who opened a Story — recorded for every viewer (so their own rings know what they have seen), but shown to the author
 * only while both the author and that viewer share Story views (`profiles.story_views`; reciprocal, like "Seen" on
 * Whispers, ADR-021). Goes with the Story.
 */
export const storyViews = pgTable(
  'story_views',
  {
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    viewerId: uuid('viewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    viewedAt: tstz('viewed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.viewerId] }), index('story_views_viewer_idx').on(t.viewerId)],
);

/** One reaction per person per Story, the same five kinds as Post Cards. The author sees who reacted with what. */
export const storyReactions = pgTable(
  'story_reactions',
  {
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.storyId, t.userId] }),
    index('story_reactions_user_idx').on(t.userId),
    check('story_reactions_kind_check', sql`${t.kind} in ('yo', 'laugh', 'fire', 'popcorn', 'love')`),
  ],
);
