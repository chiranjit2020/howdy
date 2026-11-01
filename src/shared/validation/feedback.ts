import { z } from 'zod';
import { hasDisguisingChars } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/** Feedback about Howdy (ADR-059). Browser-safe; the server validates with the same schema. */

export const FEEDBACK_KINDS = ['idea', 'broken', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  idea: 'An idea',
  broken: 'Something’s broken',
  other: 'Something else',
};
export const FEEDBACK_MAX = 1000;

export const FEEDBACK_STATUSES = ['new', 'read', 'done'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * An in-app path only ("/profile/asha"): no host, no query string, nothing that could carry someone's data, and never
 * "//": a browser reads "//site" as another site, and the thank-you page links back to this path.
 */
export const FEEDBACK_PAGE = /^\/(?:[A-Za-z0-9_.@-][A-Za-z0-9/_.@-]{0,198})?$/;

export const sendFeedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS, 'Choose what kind of feedback it is.'),
  body: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, 'Write a few words first.')
        .max(FEEDBACK_MAX, `At most ${FEEDBACK_MAX} characters.`)
        .refine((s) => !hasDisguisingChars(s), 'That contains characters that are not allowed.'),
    ),
  page: z.string().max(200).regex(FEEDBACK_PAGE, 'Not a page in Howdy.').optional(),
});
export type SendFeedback = z.infer<typeof sendFeedbackSchema>;

export const feedbackStatusSchema = z.object({ status: z.enum(FEEDBACK_STATUSES) });
