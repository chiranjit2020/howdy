import { z } from 'zod';
import { LIMITS } from '../limits';
import { cursorParamSchema, idParamSchema, postReplySchema, yoSchema } from './fence';
import { handleParamSchema, hasDisguisingChars, hasLink, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/**
 * Pure, browser-safe validation for Town Halls (communities): directory and membership (ADR-017) and the members' feed
 * (ADR-033). Names and descriptions are shown to every signed-in member, so they get the same screening as a
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

/** How a listed Town Hall is joined (ADR-041): one tap, or ask and wait for the owner or a Deputy. */
export const TOWNHALL_JOIN_RULES = ['instant', 'approval'] as const;
export type TownHallJoinRule = (typeof TOWNHALL_JOIN_RULES)[number];
export const townHallJoinRuleSchema = z.enum(TOWNHALL_JOIN_RULES);

export const createTownHallSchema = z.object({
  name: townHallNameSchema,
  description: townHallDescriptionSchema,
  visibility: townHallVisibilitySchema,
  joinRule: townHallJoinRuleSchema.default('instant'),
});

export const updateTownHallSchema = z
  .object({
    name: townHallNameSchema.optional(),
    description: townHallDescriptionSchema.optional(),
    visibility: townHallVisibilitySchema.optional(),
    joinRule: townHallJoinRuleSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to change.');

/** Everything a member can do to their own membership. One endpoint, one closed set of verbs. */
export const TOWNHALL_ACTIONS = ['join', 'leave', 'accept', 'decline'] as const;
export type TownHallAction = (typeof TOWNHALL_ACTIONS)[number];
export const townHallActionSchema = z.object({ action: z.enum(TOWNHALL_ACTIONS) });

export const inviteToTownHallSchema = z.object({ handle: z.string().pipe(handleParamSchema) });

/** Ban someone from a Town Hall by call sign (ADR-042). */
export const banFromTownHallSchema = inviteToTownHallSchema;

/**
 * What staff do about one person (ADR-041). `approve`/`decline` answer a join request (owner or Deputy);
 * `make_deputy`/`make_member` appoint or stand down a Deputy, and `make_owner` hands the Town Hall to a Deputy (owner only).
 */
export const MEMBER_ACTIONS = ['approve', 'decline', 'make_deputy', 'make_member', 'make_owner'] as const;
export type MemberAction = (typeof MEMBER_ACTIONS)[number];
export const memberActionSchema = z.object({ action: z.enum(MEMBER_ACTIONS) });

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

/**
 * The feed (ADR-033): posts by members, short replies, reactions. Posts are screened exactly like a Post Card (no links,
 * no disguising characters); replies reuse the Post Card reply rules.
 */
export const hallPostBodySchema = clean(LIMITS.TOWNHALL_POST_MAX, 'Write something to post.', 'A post');
export const hallPostSchema = z.object({ body: hallPostBodySchema });
export const hallReplySchema = postReplySchema;
export const hallReactionSchema = yoSchema;
export const hallActionSchema = z.object({ action: z.enum(['approve']) });

export const HALL_FEED_PAGE_SIZE = 20;
export const HALL_FEED_MAX_PAGE_SIZE = 50;
export const hallFeedQuerySchema = z.object({
  cursor: cursorParamSchema.optional(),
  limit: z.coerce.number().int().min(1).max(HALL_FEED_MAX_PAGE_SIZE).optional(),
});
