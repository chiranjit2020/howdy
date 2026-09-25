import { z } from 'zod';
import { cursorParamSchema, idParamSchema } from './fence';
import { hasDisguisingChars, handleParamSchema, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

export const REPORT_REASONS = ['harassment', 'spam', 'impersonation', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
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

/** Flag a Post Card: the card is named in the URL, so only the reason and details are sent. */
export const cardReportSchema = reportSchema.omit({ handle: true });

/**
 * The moderation queue (Phase 11). `member` | `moderator` | `admin` — no self-service promotion yet, set by hand.
 * Both roles pass the same `isModerator` gate; `admin` is reserved for capabilities not built yet.
 */
export const USER_ROLES = ['member', 'moderator', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const REPORT_STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Acting on one report. `remove_card` only makes sense when the report is about a specific card. */
export const REPORT_ACTIONS = ['dismiss', 'remove_card', 'suspend'] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];
export const reportActionSchema = z.object({ action: z.enum(REPORT_ACTIONS) });

/** Acting on an account directly, independent of any one report. */
export const ACCOUNT_ACTIONS = ['suspend', 'reinstate'] as const;
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];
export const accountActionSchema = z.object({ action: z.enum(ACCOUNT_ACTIONS) });

export const reportIdParamSchema = idParamSchema;

/** Page size for the queue. */
export const QUEUE_PAGE_SIZE = 20;
export const QUEUE_MAX_PAGE_SIZE = 50;
export const queueQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  cursor: cursorParamSchema.optional(),
  limit: z.coerce.number().int().min(1).max(QUEUE_MAX_PAGE_SIZE).optional(),
});
