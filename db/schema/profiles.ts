import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Ranch (public profile). Exactly one row per user, created in the same transaction as the account. The handle
 * lives on `users` (it is an identity/login identifier); everything here is presentation and privacy.
 */
export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    /** Stand-in Portrait until the Media module exists: a palette tint on the initials avatar. */
    portraitTint: text('portrait_tint').notNull().default('peach'),
    /** The Signal: a short status line that expires. Both columns are null together. */
    signal: text('signal'),
    signalSetAt: tstz('signal_set_at'),
    signalExpiresAt: tstz('signal_expires_at'),
    /** Who may open the Ranch: everyone (incl. signed out) | members (any signed-in user) | posse. Private by default. */
    ranchVisibility: text('ranch_visibility').notNull().default('members'),
    /** Who may read the Signal. Effective visibility is never broader than the Ranch's (enforced at read time). */
    signalVisibility: text('signal_visibility').notNull().default('members'),
    /** Who may read the Fence. Never broader than the Ranch's visibility (enforced at read time). */
    fenceVisibility: text('fence_visibility').notNull().default('members'),
    /** Who may write on the Fence (the owner always can): members | posse | nobody. Posse-only by default. */
    fencePosting: text('fence_posting').notNull().default('posse'),
    /** When on, every Post Card from someone else waits for the owner's approval. */
    fenceReview: boolean('fence_review').notNull().default(false),
    /** Shadow Walk: my visits leave no Track, and my own Tracks are frozen (reciprocal). Private: never shown to anyone else. */
    shadowWalk: boolean('shadow_walk').notNull().default(false),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('profiles_display_name_len', sql`char_length(${t.displayName}) between 1 and 50`),
    // No control characters in stored names (the app also strips bidi/zero-width spoofing characters).
    check('profiles_display_name_clean', sql`${t.displayName} !~ '[\\x00-\\x1f\\x7f]'`),
    check(
      'profiles_portrait_tint_check',
      sql`${t.portraitTint} in ('peach', 'mint', 'gold', 'lavender', 'sky')`,
    ),
    check('profiles_ranch_visibility_check', sql`${t.ranchVisibility} in ('everyone', 'members', 'posse')`),
    check('profiles_signal_visibility_check', sql`${t.signalVisibility} in ('everyone', 'members', 'posse')`),
    check('profiles_fence_visibility_check', sql`${t.fenceVisibility} in ('everyone', 'members', 'posse')`),
    check('profiles_fence_posting_check', sql`${t.fencePosting} in ('members', 'posse', 'nobody')`),
    check('profiles_signal_len', sql`${t.signal} is null or char_length(${t.signal}) between 1 and 80`),
    check('profiles_signal_pair', sql`(${t.signal} is null) = (${t.signalExpiresAt} is null)`),
  ],
);
