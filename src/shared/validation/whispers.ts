import { z } from 'zod';
import { LIMITS } from '../limits';
import { hasDisguisingChars, handleParamSchema, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/** Whispers stay for this long, then the retention job removes them (ADR-006). "Burn Thread" removes a thread at once. */
export const WHISPER_RETENTION_DAYS = 7;
export const THREAD_PAGE_SIZE = 30;
export const THREAD_MAX_PAGE_SIZE = 50;
export const SYNC_BATCH = 50;

/**
 * A Whisper: up to 280 characters of plain text, one paragraph. Links are allowed (it is a private thread between people who
 * chose each other), but nothing that disguises text: bidi overrides, zero-width and control characters are refused.
 */
export const whisperBodySchema = z
  .string()
  .transform(normaliseText)
  .pipe(
    z
      .string()
      .min(1, 'Write something to whisper.')
      .max(LIMITS.WHISPER_MAX, `At most ${LIMITS.WHISPER_MAX} characters.`)
      .refine((s) => !hasDisguisingChars(s), 'That contains characters that are not allowed.'),
  );

/** Chosen by the sender's device for every message; sending the same one again returns the first message, not a second. */
export const clientIdSchema = z
  .string()
  .transform((s) => s.toLowerCase())
  .pipe(
    z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'Not a valid message id.'),
  );

export const sendWhisperSchema = z.object({ clientId: clientIdSchema, body: whisperBodySchema });

/** A position in a thread, in a JSON body or a socket frame: a real integer (not a string, not null). */
export const seqSchema = z.number().int().min(0).max(2_000_000_000);
/** The same, from a query string: digits only. */
export const seqQuerySchema = z
  .string()
  .regex(/^\d{1,10}$/)
  .transform(Number)
  .pipe(seqSchema);

export const readWhisperSchema = z.object({ upTo: seqSchema });

export const threadQuerySchema = z.object({
  /** Messages older than this position (paging back). */
  before: seqQuerySchema.optional(),
  /** Messages newer than this position (catching up after a dropped connection). */
  after: seqQuerySchema.optional(),
  limit: z.coerce.number().int().min(1).max(THREAD_MAX_PAGE_SIZE).optional(),
});

export { handleParamSchema };
