import { z } from 'zod';
import { hasDisguisingChars, handleParamSchema, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/** Time Capsules (ADR-028). The date range is checked against "today" on the server. */
export const CAPSULE_MAX = 500;
export const CAPSULE_MAX_YEARS = 5;

export const capsuleBodySchema = z
  .string()
  .transform(normaliseText)
  .pipe(
    z
      .string()
      .min(1, 'Write something to seal.')
      .max(CAPSULE_MAX, `At most ${CAPSULE_MAX} characters.`)
      .refine((s) => !hasDisguisingChars(s), 'That contains characters that are not allowed.'),
  );

/** A real calendar day: 30 Feb matches the pattern but is not one (it must round-trip unchanged). */
export const capsuleDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.')
  .refine((d) => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }, 'Pick a date.');

export const sealCapsuleSchema = z.object({
  /** `me` for my future self, or the call sign of one of my Pals. */
  to: z.union([z.literal('me'), z.string().pipe(handleParamSchema)]),
  body: capsuleBodySchema,
  openOn: capsuleDaySchema,
});
export type SealCapsuleInput = z.infer<typeof sealCapsuleSchema>;
