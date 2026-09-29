import { z } from 'zod';
import { cursorParamSchema, idParamSchema } from './fence';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

export const CHIME_PAGE_SIZE = 20;
export const CHIME_MAX_PAGE_SIZE = 50;
/** Unread counts stop here ("99+"): counting further would just be work. */
export const UNREAD_CAP = 99;

export const CHIME_CATEGORIES = [
  'posse',
  'fence',
  'replies',
  'yo',
  'whispers',
  'tributes',
  'townhalls',
  'capsules',
] as const;
export type ChimeCategory = (typeof CHIME_CATEGORIES)[number];

export const chimeQuerySchema = z.object({
  cursor: cursorParamSchema.optional(),
  limit: z.coerce.number().int().min(1).max(CHIME_MAX_PAGE_SIZE).optional(),
});

/**
 * Mark Chimes read: everything (optionally only what rang up to `before`, so a Chime that arrives while the page is open is
 * not swept up unseen), or up to 50 named ones (which must be the caller's own — the server checks).
 */
export const markReadSchema = z.union([
  z.object({ all: z.literal(true), before: z.iso.datetime().optional() }),
  z.object({ ids: z.array(idParamSchema).min(1).max(50) }),
]);

export const chimePrefsSchema = z
  .object({
    posse: z.boolean().optional(),
    fence: z.boolean().optional(),
    replies: z.boolean().optional(),
    yo: z.boolean().optional(),
    whispers: z.boolean().optional(),
    tributes: z.boolean().optional(),
    townhalls: z.boolean().optional(),
    capsules: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to change.');

export type ChimePrefs = Record<ChimeCategory, boolean>;
