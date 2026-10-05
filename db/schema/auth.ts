import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
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
    /** member | moderator | admin (Phase 11). No self-service promotion yet — set by hand in the database. */
    role: text('role').notNull().default('member'),
    /**
     * When the owner asked to delete the account (status `pending_deletion`). After the grace period a daily job deletes
     * it for good; signing in before then can keep it (ADR-027).
     */
    deletionRequestedAt: tstz('deletion_requested_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('users_status_check', sql`${t.status} in ('active', 'suspended', 'pending_deletion')`),
    check('users_role_check', sql`${t.role} in ('member', 'moderator', 'admin')`),
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
  (t) => [
    index('audit_log_user_created_idx').on(t.userId, t.createdAt),
    // The daily job deletes rows older than AUDIT_RETENTION_DAYS (12 months).
    index('audit_log_created_idx').on(t.createdAt),
  ],
);

/**
 * Passkeys (ADR-040). Only the PUBLIC key is stored: the private key never leaves the person's device or password
 * manager, so a database leak yields nothing that can sign in. The credential id is the authenticator's own random
 * handle (base64url), never anything about the person.
 */
export const passkeys = pgTable(
  'passkeys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(),
    publicKey: bytea('public_key').notNull(),
    /** Signature counter as last seen. Synced passkeys always report 0; a counter that goes backwards is refused. */
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    transports: text('transports')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Coarse label such as "Chrome on Android", from the device it was added on (like Open Gates). */
    name: text('name').notNull(),
    /** Synced to a password manager (survives a lost phone) rather than bound to one device. */
    backedUp: boolean('backed_up').notNull().default(false),
    createdAt: tstz('created_at').notNull().defaultNow(),
    lastUsedAt: tstz('last_used_at'),
  },
  (t) => [
    index('passkeys_user_id_idx').on(t.userId),
    // Postgres regexes allow at most 255 repetitions, so the length is checked on its own.
    check(
      'passkeys_credential_id_shape',
      sql`${t.credentialId} ~ '^[A-Za-z0-9_-]+$' and length(${t.credentialId}) between 16 and 1366`,
    ),
  ],
);

/**
 * Authenticator-app codes (TOTP, RFC 6238), at most one per person (ADR-040). The shared secret has to be readable to
 * check a code, so it is ENCRYPTED (AES-256-GCM, key derived from AUTH_SECRET), never stored in the clear.
 * `confirmedAt` is null while it is being set up: it only counts once a correct code has been typed.
 */
export const totpFactors = pgTable('totp_factors', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretEnc: text('secret_enc').notNull(),
  confirmedAt: tstz('confirmed_at'),
  /** The newest 30-second step a code was accepted for: a code is never accepted twice (replay). */
  lastStep: bigint('last_step', { mode: 'number' }),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

/** One-time recovery codes (ADR-040), stored only as a keyed hash. A new set replaces the old one. */
export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: bytea('code_hash').notNull().unique(),
    usedAt: tstz('used_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [index('recovery_codes_user_id_idx').on(t.userId)],
);

/**
 * A WebAuthn challenge, waiting for the browser's answer (ADR-040). Single use (claimed with DELETE … RETURNING), short
 * lived, and bound to its purpose and, for adding a passkey, to the person who asked.
 */
export const webauthnChallenges = pgTable(
  'webauthn_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    challenge: text('challenge').notNull(),
    purpose: text('purpose').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: tstz('expires_at').notNull(),
  },
  (t) => [
    check('webauthn_challenges_purpose_check', sql`${t.purpose} in ('register', 'sign_in')`),
    check('webauthn_challenges_register_has_user', sql`${t.purpose} = 'sign_in' or ${t.userId} is not null`),
    index('webauthn_challenges_expires_idx').on(t.expiresAt),
  ],
);

/**
 * Call signs of deleted accounts, held back for a while so nobody can take one at once to impersonate the person who
 * left (ADR-027). Only a keyed hash of the call sign is stored — never the name — and the row goes when it is free.
 */
export const retiredHandles = pgTable('retired_handles', {
  handleDigest: text('handle_digest').primaryKey(),
  availableAt: tstz('available_at').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
});
