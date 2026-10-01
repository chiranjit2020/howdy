import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * A Porch Light (ADR-032): "I'm free to talk" for up to two hours, seen by my Pals (or only my Close Pals). One row per
 * person while it is on; switching it off deletes the row, and an expired row means nothing and is swept daily. No
 * history is kept, so nobody can ever see when someone was last "around". Deleted with the account (CASCADE).
 */
export const porchLights = pgTable(
  'porch_lights',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** pals | close — close means only the Pals I privately marked as Close. */
    audience: text('audience').notNull(),
    note: text('note'),
    litAt: tstz('lit_at').notNull().defaultNow(),
    untilAt: tstz('until_at').notNull(),
  },
  (t) => [
    check('porch_lights_audience_check', sql`${t.audience} in ('pals', 'close')`),
    check('porch_lights_note_len', sql`${t.note} is null or char_length(${t.note}) between 1 and 60`),
    check(
      'porch_lights_length',
      sql`${t.untilAt} > ${t.litAt} and ${t.untilAt} <= ${t.litAt} + interval '2 hours'`,
    ),
    index('porch_lights_until_idx').on(t.untilAt),
  ],
);
