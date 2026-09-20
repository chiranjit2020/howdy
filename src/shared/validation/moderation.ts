import { z } from 'zod';
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
