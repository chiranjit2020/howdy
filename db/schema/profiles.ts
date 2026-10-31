import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
    /** A short line about yourself under your name on the Porch (null = none). Seen by whoever may open the Porch. */
    bio: text('bio'),
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
    /**
     * Read receipts ("Seen" on Whispers), reciprocal: shown in a thread only when BOTH people have them on. Private: whether
     * someone has them off is never shown, so a missing "Seen" also covers for a Restrict (ADR-021).
     */
    readReceipts: boolean('read_receipts').notNull().default(true),
    /**
     * Story views, reciprocal (ADR-047): when on, my views of others' Stories are recorded and I see who viewed mine;
     * when off, neither. Private: whether someone has it off is never shown.
     */
    storyViews: boolean('story_views').notNull().default(true),
    /** Suggest me to Pals of my Pals ("Pals you may know", Phase 13 / ADR-029). On by default; switch off in the Workshop. */
    discoverable: boolean('discoverable').notNull().default(true),
    /**
     * Findable in search by name or username (2026-10-30). OFF by default, for every account old and new: nobody becomes
     * findable without choosing it. Your friends can always find you either way.
     */
    searchable: boolean('searchable').notNull().default(false),
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
    check('profiles_bio_len', sql`${t.bio} is null or char_length(${t.bio}) between 1 and 150`),
    check('profiles_signal_pair', sql`(${t.signal} is null) = (${t.signalExpiresAt} is null)`),
  ],
);

const AUDIENCE_CHECK = (col: unknown) => sql`${col} in ('members', 'posse', 'only_me')`;

/**
 * Personal details under a profile (all optional), each with its own audience (members / posse = friends / only_me),
 * which the server applies every time the profile is read. One row per user, made on first save; gone with the account.
 * Birthday is day and month only (never a year, so it can never reveal an age).
 */
export const profileDetails = pgTable(
  'profile_details',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    livesIn: text('lives_in'),
    hometown: text('hometown'),
    work: text('work'),
    education: text('education'),
    languages: text('languages'),
    birthdayDay: smallint('birthday_day'),
    birthdayMonth: smallint('birthday_month'),
    relationship: text('relationship'),
    livesInAudience: text('lives_in_audience').notNull().default('posse'),
    hometownAudience: text('hometown_audience').notNull().default('posse'),
    workAudience: text('work_audience').notNull().default('posse'),
    educationAudience: text('education_audience').notNull().default('posse'),
    languagesAudience: text('languages_audience').notNull().default('posse'),
    birthdayAudience: text('birthday_audience').notNull().default('posse'),
    relationshipAudience: text('relationship_audience').notNull().default('posse'),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    ...(['livesIn', 'hometown', 'work', 'education', 'languages'] as const).map((k) =>
      check(
        `profile_details_${t[k].name}_len`,
        sql`${t[k]} is null or char_length(${t[k]}) between 1 and 60`,
      ),
    ),
    ...(['livesIn', 'hometown', 'work', 'education', 'languages'] as const).map((k) =>
      check(`profile_details_${t[k].name}_clean`, sql`${t[k]} is null or ${t[k]} !~ '[\\x00-\\x1f\\x7f]'`),
    ),
    check('profile_details_birthday_pair', sql`(${t.birthdayDay} is null) = (${t.birthdayMonth} is null)`),
    check(
      'profile_details_birthday_range',
      sql`${t.birthdayDay} is null or (${t.birthdayMonth} between 1 and 12 and ${t.birthdayDay} between 1 and 31)`,
    ),
    check(
      'profile_details_relationship_check',
      sql`${t.relationship} is null or ${t.relationship} in ('single', 'in_relationship', 'engaged', 'married', 'complicated')`,
    ),
    ...(
      [
        'livesInAudience',
        'hometownAudience',
        'workAudience',
        'educationAudience',
        'languagesAudience',
        'birthdayAudience',
        'relationshipAudience',
      ] as const
    ).map((k) => check(`profile_details_${t[k].name}_check`, AUDIENCE_CHECK(t[k]))),
  ],
);
