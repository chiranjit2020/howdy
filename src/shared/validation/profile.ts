import { z } from 'zod';
import { LIMITS } from '../limits';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/**
 * Pure, browser-safe validation for Ranch (profile) input. The server re-validates with the same schemas.
 * Names and Signals are shown to other people, so they are normalised and screened against look-alike spoofing
 * and link spam. Everything is rendered as plain text by React — this is defence in depth, not the XSS control.
 */

export const PORTRAIT_TINTS = ['peach', 'mint', 'gold', 'lavender', 'sky'] as const;
export type PortraitTint = (typeof PORTRAIT_TINTS)[number];

/** Who may open a Ranch / read a Signal. Ordered from most to least open. */
export const VISIBILITIES = ['everyone', 'members', 'posse'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Who may write on a Fence. The owner can always write. Ordered from most to least open. */
export const FENCE_POSTING_LEVELS = ['members', 'posse', 'nobody'] as const;
export type FencePosting = (typeof FENCE_POSTING_LEVELS)[number];

export const DISPLAY_NAME_MAX = 50;
/** A Signal lives for this long after it is set. */
export const SIGNAL_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Characters that can disguise text: C0/C1 controls, soft hyphen, zero-width space, left/right marks, bidi embeddings
 * and overrides/isolates (the classic "reversed filename" trick), word joiner & invisible operators, BOM.
 * ZWNJ (U+200C) and ZWJ (U+200D) are allowed: Indic and Persian scripts and emoji sequences need them.
 */
const DISGUISING_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f], // C0 controls
  [0x007f, 0x009f], // DEL + C1 controls
  [0x00ad, 0x00ad], // soft hyphen
  [0x200b, 0x200b], // zero-width space
  [0x200e, 0x200f], // left-to-right / right-to-left marks
  [0x202a, 0x202e], // bidi embeddings and overrides
  [0x2060, 0x2064], // word joiner, invisible operators
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // byte order mark / zero-width no-break space
];
// Built from numbers (not a regex literal) so the source stays plain ASCII and a formatter cannot turn the escapes
// into raw invisible characters.
const cp = (n: number) => `\\u${n.toString(16).padStart(4, '0')}`;
const DISGUISING = new RegExp(
  `[${DISGUISING_RANGES.map(([a, b]) => (a === b ? cp(a) : `${cp(a)}-${cp(b)}`)).join('')}]`,
);

/** A link or bare domain. Ranch text is for people, not for pushing traffic. */
const LINKISH =
  /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|in|app|dev|xyz|me|ly|gg|info|biz|ru|cn)\b)/i;

/** True if the text contains a link or bare domain. */
export const hasLink = (s: string): boolean => LINKISH.test(s);

/** True if the text contains a character that can disguise it (bidi controls, zero-width, control characters). */
export const hasDisguisingChars = (s: string): boolean => DISGUISING.test(s);

/** Trim, apply Unicode NFC, and collapse runs of whitespace to a single space. */
export function normaliseText(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

const cleanText = (max: number, emptyMessage: string, what: string) =>
  z
    .string()
    .transform(normaliseText)
    .pipe(
      z
        .string()
        .min(1, emptyMessage)
        .max(max, `At most ${max} characters.`)
        .refine((s) => !DISGUISING.test(s), `${what} contains characters that are not allowed.`)
        .refine((s) => !LINKISH.test(s), `Links are not allowed in ${what.toLowerCase()}.`),
    );

export const displayNameSchema = cleanText(DISPLAY_NAME_MAX, 'Enter a display name.', 'Your name');
export const signalSchema = cleanText(LIMITS.SIGNAL_MAX, 'Say something, or clear your Signal.', 'A Signal');

export const portraitTintSchema = z.enum(PORTRAIT_TINTS);
export const visibilitySchema = z.enum(VISIBILITIES);
export const fencePostingSchema = z.enum(FENCE_POSTING_LEVELS);

/** PATCH /api/me/porch — every field optional, at least one required. Unknown keys are dropped (no mass assignment). */
export const updateRanchSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    portraitTint: portraitTintSchema.optional(),
    ranchVisibility: visibilitySchema.optional(),
    signalVisibility: visibilitySchema.optional(),
    fenceVisibility: visibilitySchema.optional(),
    fencePosting: fencePostingSchema.optional(),
    fenceReview: z.boolean().optional(),
    shadowWalk: z.boolean().optional(),
    readReceipts: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to change.');

export const setSignalSchema = z.object({ text: signalSchema });

/** Handle taken from a URL path: lower-cased and shape-checked before it ever reaches a query. */
export const handleParamSchema = z
  .string()
  .transform((s) => s.toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9_]{3,24}$/));
