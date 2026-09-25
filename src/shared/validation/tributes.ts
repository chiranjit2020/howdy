import { z } from 'zod';
import { LIMITS } from '../limits';
import { cursorParamSchema, idParamSchema } from './fence';
import { hasDisguisingChars, hasLink, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/**
 * Pure, browser-safe validation for Tributes (public testimonials). A Tribute is shown to other people, so it gets the
 * same screening as a Post Card: normalised, no look-alike/bidi/zero-width tricks, and no links.
 */

export const tributeBodySchema = z
  .string()
  .transform(normaliseText)
  .pipe(
    z
      .string()
      .min(1, 'Write something to leave as a Tribute.')
      .max(LIMITS.TRIBUTE_MAX, `At most ${LIMITS.TRIBUTE_MAX} characters.`)
      .refine((s) => !hasDisguisingChars(s), 'A Tribute contains characters that are not allowed.')
      .refine((s) => !hasLink(s), 'Links are not allowed in a Tribute.'),
  );

export const giveTributeSchema = z.object({ body: tributeBodySchema });
export const pinTributeSchema = z.object({ pinned: z.boolean() });

/** Page size for a Ranch's Tributes. */
export const TRIBUTE_PAGE_SIZE = 20;
export const TRIBUTE_MAX_PAGE_SIZE = 50;

export const tributeIdParamSchema = idParamSchema;

export const tributesQuerySchema = z.object({
  cursor: cursorParamSchema.optional(),
  limit: z.coerce.number().int().min(1).max(TRIBUTE_MAX_PAGE_SIZE).optional(),
});
