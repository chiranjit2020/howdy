import { z } from 'zod';
import { cursorParamSchema, idParamSchema } from './fence';
import { hasDisguisingChars, handleParamSchema, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

export const REPORT_REASONS = ['harassment', 'spam', 'impersonation', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** How a reason reads to people: moderators in the queue, and a suspended person at sign-in. */
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  harassment: 'Harassment',
  spam: 'Spam',
  impersonation: 'Impersonation',
  inappropriate: 'Inappropriate content',
  other: 'Breaking the Campfire Rules',
};
export const REPORT_DETAILS_MAX = 500;

/**
 * "Flag trouble". Details may contain links (evidence), unlike names and Signals, but never characters that disguise
 * text: a moderator reads these, so bidi tricks and invisible characters are refused.
 */
export const reportSchema = z.object({
  handle: z.string().pipe(handleParamSchema),
  reason: z.enum(REPORT_REASONS),
  details: z
    .string()
    .transform(normaliseText)
    .pipe(
      z
        .string()
        .max(REPORT_DETAILS_MAX, `At most ${REPORT_DETAILS_MAX} characters.`)
        .refine((s) => !hasDisguisingChars(s), 'That contains characters that are not allowed.'),
    )
    .optional(),
});

/** Flag one thing (a Post Card, a photo, a Whisper, a Town Hall, a Town Hall post): it is named in the URL, so only reason + details. */
export const cardReportSchema = reportSchema.omit({ handle: true });
export const thingReportSchema = cardReportSchema;

/**
 * The moderation queue (Phase 11). `member` | `moderator` | `admin` — no self-service promotion yet, set by hand.
 * Both roles pass the same `isModerator` gate; `admin` is reserved for capabilities not built yet.
 */
export const USER_ROLES = ['member', 'moderator', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const REPORT_STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * How long a suspension lasts (ADR-023). A timed one lifts itself; `indefinite` lasts until a moderator lifts it. The
 * reason is one of the report reasons, because the suspended person is shown it — never a moderator's free text.
 */
export const SUSPENSION_LENGTHS = ['7d', '30d', 'indefinite'] as const;
export type SuspensionLength = (typeof SUSPENSION_LENGTHS)[number];
export const SUSPENSION_DAYS: Record<SuspensionLength, number | null> = {
  '7d': 7,
  '30d': 30,
  indefinite: null,
};

/** What a report can be about (ADR-025): the person, or one thing of theirs. */
export const REPORT_SUBJECTS = ['person', 'card', 'portrait', 'whisper', 'town_hall', 'hall_post'] as const;
export type ReportSubject = (typeof REPORT_SUBJECTS)[number];

/** Acting on one report. Each `remove_*` only makes sense when the report is about that kind of thing. */
export const REPORT_ACTIONS = [
  'dismiss',
  'remove_card',
  'remove_portrait',
  'remove_whisper',
  'remove_town_hall',
  'remove_hall_post',
  'suspend',
] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];
/** Suspending from a report must say for how long; the reason defaults to the report's own. */
export const reportActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.enum([
      'dismiss',
      'remove_card',
      'remove_portrait',
      'remove_whisper',
      'remove_town_hall',
      'remove_hall_post',
    ]),
  }),
  z.object({
    action: z.literal('suspend'),
    length: z.enum(SUSPENSION_LENGTHS),
    reason: z.enum(REPORT_REASONS).optional(),
  }),
]);
export type ReportActionInput = z.infer<typeof reportActionSchema>;

/** Acting on an account directly, independent of any one report. */
export const ACCOUNT_ACTIONS = ['suspend', 'reinstate'] as const;
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];
export const accountActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reinstate') }),
  z.object({
    action: z.literal('suspend'),
    length: z.enum(SUSPENSION_LENGTHS),
    reason: z.enum(REPORT_REASONS),
  }),
]);

/** A suspended person's one appeal. Plain text a moderator will read: same rules as report details. */
export const APPEAL_MAX = 500;
export const appealTextSchema = z
  .string()
  .transform(normaliseText)
  .pipe(
    z
      .string()
      .min(1, 'Say why the suspension should be lifted.')
      .max(APPEAL_MAX, `At most ${APPEAL_MAX} characters.`)
      .refine((s) => !hasDisguisingChars(s), 'That contains characters that are not allowed.'),
  );

/** A moderator's answer to an appeal: lift the suspension, or let it stand. */
export const APPEAL_DECISIONS = ['grant', 'uphold'] as const;
export type AppealDecision = (typeof APPEAL_DECISIONS)[number];
export const appealDecisionSchema = z.object({ decision: z.enum(APPEAL_DECISIONS) });
export const appealsQuerySchema = z.object({ cursor: cursorParamSchema.optional() });

export const reportIdParamSchema = idParamSchema;

/** Page size for the queue. */
export const QUEUE_PAGE_SIZE = 20;
export const QUEUE_MAX_PAGE_SIZE = 50;
export const queueQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  cursor: cursorParamSchema.optional(),
  limit: z.coerce.number().int().min(1).max(QUEUE_MAX_PAGE_SIZE).optional(),
});
