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
 * Directory + membership only this phase: no shared post feed yet (see ADR-017). Deleting the owner deletes the whole
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
