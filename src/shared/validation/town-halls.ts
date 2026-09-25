import { z } from 'zod';
import { LIMITS } from '../limits';
import { cursorParamSchema, idParamSchema } from './fence';
import { handleParamSchema, hasDisguisingChars, hasLink, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/**
 * Pure, browser-safe validation for Town Halls (communities). Directory + membership only this phase — no shared post
 * feed (ADR-017). Names and descriptions are shown to every signed-in member, so they get the same screening as a
 * Tribute: normalised, no look-alike/bidi/zero-width tricks, and no links.
 */

/**
 * Who may find and join. `open` and `members` both self-serve instantly and are both listed in the directory — the
 * distinct label is for the owner, not a different join rule. `invite` is never listed; only an accepted invite admits
 * someone.
 */
export const TOWNHALL_VISIBILITIES = ['open', 'members', 'invite'] as const;
export type TownHallVisibility = (typeof TOWNHALL_VISIBILITIES)[number];

const clean = (max: number, emptyMessage: string, what: string) =>
  z
    .string()
    .transform(normaliseText)
    .pipe(
      z
        .string()
        .min(1, emptyMessage)
        .max(max, `At most ${max} characters.`)
        .refine((s) => !hasDisguisingChars(s), `${what} contains characters that are not allowed.`)
        .refine((s) => !hasLink(s), `Links are not allowed in ${what.toLowerCase()}.`),
    );

export const townHallNameSchema = clean(LIMITS.TOWNHALL_NAME_MAX, 'Give it a name.', 'A Town Hall name').pipe(
  z.string().min(LIMITS.TOWNHALL_NAME_MIN, `At least ${LIMITS.TOWNHALL_NAME_MIN} characters.`),
);
export const townHallDescriptionSchema = clean(
  LIMITS.TOWNHALL_DESCRIPTION_MAX,
  'Say what it is about.',
  'A Town Hall description',
);
export const townHallVisibilitySchema = z.enum(TOWNHALL_VISIBILITIES);

export const createTownHallSchema = z.object({
  name: townHallNameSchema,
  description: townHallDescriptionSchema,
  visibility: townHallVisibilitySchema,
});

export const updateTownHallSchema = z
  .object({
    name: townHallNameSchema.optional(),
    description: townHallDescriptionSchema.optional(),
    visibility: townHallVisibilitySchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to change.');

/** Everything a member can do to their own membership. One endpoint, one closed set of verbs. */
export const TOWNHALL_ACTIONS = ['join', 'leave', 'accept', 'decline'] as const;
export type TownHallAction = (typeof TOWNHALL_ACTIONS)[number];
export const townHallActionSchema = z.object({ action: z.enum(TOWNHALL_ACTIONS) });

export const inviteToTownHallSchema = z.object({ handle: z.string().pipe(handleParamSchema) });

export const townHallIdParamSchema = idParamSchema;

/** Page size for the directory. */
export const TOWNHALL_PAGE_SIZE = 20;
export const TOWNHALL_MAX_PAGE_SIZE = 50;
export const townHallsQuerySchema = z.object({
  cursor: cursorParamSchema.optional(),
  limit: z.coerce.number().int().min(1).max(TOWNHALL_MAX_PAGE_SIZE).optional(),
});

/** Roster page size (a Town Hall's own membership can outgrow a single response). */
export const MEMBER_PAGE_SIZE = 50;
export const MEMBER_MAX_PAGE_SIZE = 100;
