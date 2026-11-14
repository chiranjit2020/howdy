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
 * Who may find and join a circle (ADR-054). `open` ("Friends can find it"): shown to friends of its members, and anyone
 * with its link may join (or ask, under the approval rule). `invite` ("Private"): never shown; only an accepted invite
 * admits someone. (`members` was the same as `open` under another label, and is retired.)
 */
export const TOWNHALL_VISIBILITIES = ['open', 'invite'] as const;
export type TownHallVisibility = (typeof TOWNHALL_VISIBILITIES)[number];

const clean = (max: number, emptyMessage: string, what: string, allowEmpty = false) =>
  z
    .string()
    .transform(normaliseText)
    .pipe(
      z
        .string()
        .min(allowEmpty ? 0 : 1, emptyMessage)
        .max(max, `At most ${max} characters.`)
        .refine((s) => !hasDisguisingChars(s), `${what} contains characters that are not allowed.`)
        .refine((s) => !hasLink(s), `Links are not allowed in ${what.toLowerCase()}.`),
    );

export const townHallNameSchema = clean(LIMITS.TOWNHALL_NAME_MAX, 'Give it a name.', 'A group name').pipe(
  z.string().min(LIMITS.TOWNHALL_NAME_MIN, `At least ${LIMITS.TOWNHALL_NAME_MIN} characters.`),
);
export const townHallDescriptionSchema = clean(
  LIMITS.TOWNHALL_DESCRIPTION_MAX,
  'Say what it is about.',
  'A group description',
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
/** A post, and optionally one finished photo of mine to go with it (ADR-046). Words OR a photo, as on a wall. */
export const hallPostSchema = z
  .object({
    body: clean(LIMITS.TOWNHALL_POST_MAX, 'Write something or add a photo.', 'A post', true).default(''),
    photoId: z.uuid().optional(),
  })
  .refine((p) => p.body !== '' || p.photoId !== undefined, {
    message: 'Write something or add a photo.',
    path: ['body'],
  });

/** An answer to a group event (ADR-056): going, maybe or can't go (`no`). */
export const RSVP_ANSWERS = ['going', 'maybe', 'no'] as const;
export type RsvpAnswer = (typeof RSVP_ANSWERS)[number];
export const rsvpSchema = z.object({ answer: z.enum(RSVP_ANSWERS).nullable() });

/** How far ahead an event may be set. */
export const EVENT_MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/**
 * A new group event (ADR-056): a name, when it starts (an ISO time with its offset; the form sends Howdy's calendar,
 * +05:30), an optional place and optional details. It must start in the future and within a year. The name, place
 * and details get the same screening as a post (no links, no disguising characters).
 */
export const createEventSchema = z.object({
  title: clean(LIMITS.EVENT_TITLE_MAX, 'Say what the event is.', 'An event name').pipe(
    z.string().min(3, 'At least 3 characters.'),
  ),
  startsAt: z
    .string()
    .refine(
      (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?([+-]\d{2}:\d{2}|Z)$/.test(s),
      'Pick a date and a time.',
    )
    .transform((s) => new Date(s))
    .refine((d) => !Number.isNaN(d.getTime()), 'Pick a date and a time.')
    .refine((d) => d.getTime() > Date.now(), 'Pick a time that is still to come.')
    .refine((d) => d.getTime() < Date.now() + EVENT_MAX_AHEAD_MS, 'Pick a date within the next year.'),
  place: z.preprocess(blankToUndefined, clean(LIMITS.EVENT_PLACE_MAX, 'Say where.', 'A place').optional()),
  details: z.preprocess(blankToUndefined, hallPostBodySchema.optional()),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

/**
 * A new group poll (ADR-057): a question and two to four different options (blank ones are dropped first, so the form
 * can send its empty boxes). Every part gets a post's screening.
 */
export const createPollSchema = z.object({
  question: clean(LIMITS.POLL_QUESTION_MAX, 'Ask a question.', 'A question').pipe(
    z.string().min(3, 'At least 3 characters.'),
  ),
  options: z
    .array(z.string())
    .transform((all) => all.map((o) => o.trim()).filter((o) => o !== ''))
    .pipe(
      z
        .array(clean(LIMITS.POLL_OPTION_MAX, 'Write the option.', 'An option'))
        .min(LIMITS.POLL_OPTIONS_MIN, `Give at least ${LIMITS.POLL_OPTIONS_MIN} options.`)
        .max(LIMITS.POLL_OPTIONS_MAX, `At most ${LIMITS.POLL_OPTIONS_MAX} options.`)
        .refine(
          (all) => new Set(all.map((o) => o.toLowerCase())).size === all.length,
          'Each option must be different.',
        ),
    ),
});
export type CreatePollInput = z.infer<typeof createPollSchema>;

/** Vote for one option (its id), or `null` to take the vote back. */
export const pollVoteSchema = z.object({ optionId: z.uuid().nullable() });

/**
 * "Buy or wait?" (ADR-065): what the asker wants (`item`), its price in whole rupees, why (`why`, the post's words), an
 * optional alternative and an optional photo. Every word gets a post's screening (no links, no disguising characters).
 */
export const createAskSchema = z.object({
  item: clean(LIMITS.ASK_ITEM_MAX, 'Say what you want to buy.', 'The item').pipe(
    z.string().min(2, 'At least 2 characters.'),
  ),
  price: z.coerce
    .number({ error: 'Give the price in rupees.' })
    .int('Give a whole number of rupees.')
    .min(1, 'Give the price in rupees.')
    .max(LIMITS.ASK_PRICE_MAX, 'That price is too high for Howdy.'),
  why: clean(LIMITS.TOWNHALL_POST_MAX, 'Say why you want it.', 'Your reason').pipe(
    z.string().min(3, 'At least 3 characters.'),
  ),
  alternative: z.preprocess(
    blankToUndefined,
    clean(LIMITS.ASK_ALTERNATIVE_MAX, 'Say what else you could do.', 'The alternative').optional(),
  ),
  photoId: z.uuid().optional(),
});
export type CreateAskInput = z.infer<typeof createAskSchema>;

/**
 * Who a public "Buy or wait?" is for (ADR-066): my friends, or everyone on Howdy (its link also opens signed out).
 * Group questions are asked in the group (`createAskSchema`).
 */
export const ASK_AUDIENCES = ['friends', 'everyone'] as const;
export type AskAudience = (typeof ASK_AUDIENCES)[number];
/** A public question: the same fields as a group one, without a photo (v1), plus who it is for. */
export const createPublicAskSchema = createAskSchema.extend({ audience: z.enum(ASK_AUDIENCES) });
export type CreatePublicAskInput = z.infer<typeof createPublicAskSchema>;

/** Which questions the Buy or wait page lists: everyone's and my friends' (`all`), my friends' only, or mine. */
export const ASK_LISTS = ['all', 'friends', 'mine'] as const;
export type AskList = (typeof ASK_LISTS)[number];
export const askListQuerySchema = z.object({
  show: z.enum(ASK_LISTS).default('all'),
  cursor: cursorParamSchema.optional(),
});

export const ASK_VERDICTS = ['buy', 'wait'] as const;
export type AskVerdict = (typeof ASK_VERDICTS)[number];
export const ASK_OUTCOMES = ['bought', 'waiting', 'skipped'] as const;
export type AskOutcome = (typeof ASK_OUTCOMES)[number];

/** An answer: buy or wait, with a short reason (required: a bare vote helps nobody). `{verdict: null}` takes it back. */
export const askAnswerSchema = z
  .object({
    verdict: z.enum(ASK_VERDICTS).nullable(),
    reason: z.preprocess(
      blankToUndefined,
      clean(LIMITS.ASK_REASON_MAX, 'Say why, in a few words.', 'Your reason')
        .pipe(z.string().min(2, 'Say why, in a few words.'))
        .optional(),
    ),
  })
  .refine((a) => a.verdict === null || a.reason !== undefined, {
    message: 'Say why, in a few words.',
    path: ['reason'],
  });
export type AskAnswerInput = z.infer<typeof askAnswerSchema>;

/** The asker's one update (answers a question the group raised). */
export const askNoteSchema = z.object({
  note: clean(LIMITS.TOWNHALL_POST_MAX, 'Write your update.', 'An update'),
});
/** What the asker decided. */
export const askDecideSchema = z.object({ outcome: z.enum(ASK_OUTCOMES) });

export const hallReplySchema = postReplySchema;
export const hallReactionSchema = yoSchema;
export const hallActionSchema = z.object({ action: z.enum(['approve']) });

export const HALL_FEED_PAGE_SIZE = 20;
export const HALL_FEED_MAX_PAGE_SIZE = 50;
export const hallFeedQuerySchema = z.object({
  cursor: cursorParamSchema.optional(),
  limit: z.coerce.number().int().min(1).max(HALL_FEED_MAX_PAGE_SIZE).optional(),
});
