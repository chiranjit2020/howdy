import { z } from 'zod';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/** Pure, browser-safe validation for Marks (deep-vibe awards). The server re-validates with the same schema. */

export const MARK_KINDS = ['chill', 'pure', 'cinema', 'sigma', 'gem'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export const giveMarkSchema = z.object({ kind: z.enum(MARK_KINDS) });
