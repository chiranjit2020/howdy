import { z } from 'zod';
import { hasDisguisingChars, hasLink, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/** Porch Light (ADR-032): how long it may stay on, who sees it, and an optional short note. */
export const LIGHT_MINUTES = [30, 60, 120] as const;
export type LightMinutes = (typeof LIGHT_MINUTES)[number];
export const LIGHT_AUDIENCES = ['pals', 'close'] as const;
export type LightAudience = (typeof LIGHT_AUDIENCES)[number];
export const LIGHT_NOTE_MAX = 60;

/** Shown to Pals like a Post Card, so the same screening: normalised, no disguising characters, no links. */
const noteSchema = z
  .string()
  .transform(normaliseText)
  .pipe(
    z
      .string()
      .max(LIGHT_NOTE_MAX, `At most ${LIGHT_NOTE_MAX} characters.`)
      .refine((s) => !hasDisguisingChars(s), 'That contains characters that are not allowed.')
      .refine((s) => !hasLink(s), 'Links are not allowed in a note.'),
  );

export const switchOnLightSchema = z.object({
  minutes: z.literal(LIGHT_MINUTES, 'Pick how long.'),
  audience: z.enum(LIGHT_AUDIENCES),
  /** Empty means no note. */
  note: noteSchema.optional(),
});
export type SwitchOnLightInput = z.infer<typeof switchOnLightSchema>;
