import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { postCards } from './fence';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A stored file. Today only Portraits (profile photos). The bytes live in object storage; this row says who owns them and
 * where. The object key is random and reveals nothing about the owner.
 *
 * Life of a Portrait row:
 *   pending  - the browser was given a signed upload URL; nothing is trusted yet (the object may not even exist)
 *   ready    - the server decoded the upload, cropped it and re-encoded it; this is what gets served. At most ONE per owner
 *   retired  - replaced or removed; the object is deleted first, then the row (the retention job finishes any that were interrupted)
 * Everything is deleted with its owner. Deleting the OBJECTS on account deletion is the module's job (rows cascade, files do not).
 */
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** portrait (a Porch photo) | card_photo (one photo on a Post Card, Phase 13+ / ADR-031). */
    kind: text('kind').notNull().default('portrait'),
    /**
     * The Post Card a `card_photo` belongs to. Null while it waits to be nailed (thrown away after an hour), and again
     * once its card is removed (SET NULL): a detached card photo is never served, and its file is deleted by the job.
     */
    cardId: uuid('card_id').references(() => postCards.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('pending'),
    /** Where the bytes are in storage. Random; never derived from the owner or the file name. */
    objectKey: text('object_key').notNull().unique(),
    /** Set once the upload is processed: always the type we produced (image/webp), never what the client claimed. */
    contentType: text('content_type'),
    byteSize: bigint('byte_size', { mode: 'number' }),
    width: integer('width'),
    height: integer('height'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('media_kind_check', sql`${t.kind} in ('portrait', 'card_photo')`),
    check('media_card_only_for_card_photos', sql`${t.cardId} is null or ${t.kind} = 'card_photo'`),
    check('media_status_check', sql`${t.status} in ('pending', 'ready', 'retired')`),
    // One live Portrait per person, enforced by the database, not just by the code.
    uniqueIndex('media_one_ready_per_owner_idx')
      .on(t.ownerId, t.kind)
      .where(sql`${t.status} = 'ready' and ${t.kind} = 'portrait'`),
    // One photo per card.
    uniqueIndex('media_one_per_card_idx')
      .on(t.cardId)
      .where(sql`${t.cardId} is not null`),
    index('media_owner_idx').on(t.ownerId),
    // The retention job looks for stale pending rows and for retired ones.
    index('media_status_created_idx').on(t.status, t.createdAt),
  ],
);
