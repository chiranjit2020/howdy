import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  customType,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Case-insensitive text (emails, handles). Requires the citext extension (migration 0000). */
const citext = customType<{ data: string }>({ dataType: () => 'citext' });
/** Raw bytes. Session and email tokens are stored only as SHA-256 digests. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull().unique(),
    handle: citext('handle').notNull().unique(),
    emailVerifiedAt: tstz('email_verified_at'),
    /** active | suspended | pending_deletion. Only `active` accounts can sign in or hold a session. */
    status: text('status').notNull().default('active'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('users_status_check', sql`${t.status} in ('active', 'suspended', 'pending_deletion')`),
    check('users_handle_format', sql`${t.handle}::text ~ '^[a-z0-9_]{3,24}$'`),
    check(
      'users_email_shape',
      sql`length(${t.email}::text) <= 254 and position('@' in ${t.email}::text) > 1`,
    ),
  ],
);

/**
 * Password credential, one row per user. Kept apart from `users` so other factors (passkeys, TOTP) can be added
 * as sibling tables later without reshaping `users` (ADR-003).
 */
export const credentials = pgTable('credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Argon2id PHC string (includes salt and parameters). */
  passwordHash: text('password_hash').notNull(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    /** Public identifier (safe to show in "Open Gates"). NOT the secret token. */
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** sha256(token). The token itself exists only in the user's cookie. */
    tokenHash: bytea('token_hash').notNull().unique(),
    /** Coarse device label such as "Edge on Windows". No IP address is stored. */
    deviceLabel: text('device_label').notNull().default('Unknown device'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    lastSeenAt: tstz('last_seen_at').notNull().defaultNow(),
    idleExpiresAt: tstz('idle_expires_at').notNull(),
    absoluteExpiresAt: tstz('absolute_expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    tokenHash: bytea('token_hash').notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    usedAt: tstz('used_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('email_tokens_purpose_check', sql`${t.purpose} in ('verify_email', 'reset_password')`),
    index('email_tokens_user_purpose_idx').on(t.userId, t.purpose),
  ],
);

/** Security-relevant events. Deliberately no IP addresses, tokens, passwords or message content. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** Set null (not cascade) so the trail survives account deletion, anonymised. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    event: text('event').notNull(),
    requestId: text('request_id'),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [index('audit_log_user_created_idx').on(t.userId, t.createdAt)],
);
