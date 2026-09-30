import { z } from 'zod';
import { LIMITS } from '../limits';
import { hasDisguisingChars, hasLink, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/**
 * Pure, browser-safe validation for the Fence (Post Cards, replies, Yo). The server re-validates with the same schemas.
 * Cards are shown to other people and can be posted by strangers, so they get the same screening as Signals: normalised,
 * no look-alike/bidi/zero-width tricks, and no links (the Fence is for people, not for pushing traffic).
 */

const fenceText = (max: number, emptyMessage: string, what: string) =>
  z
    .string()
    .transform(normaliseText)
    .pipe(
      z
        .string()
        .min(1, emptyMessage)
        .max(max, `At most ${max} characters.`)
        .refine((s) => !hasDisguisingChars(s), `${what} contains characters that are not allowed.`)
        .refine((s) => !hasLink(s), `Links are not allowed in ${what.toLowerCase()}.`),
    );

export const cardBodySchema = fenceText(LIMITS.POST_CARD_MAX, 'Write something to nail up.', 'A Post Card');
export const replyBodySchema = fenceText(LIMITS.REPLY_MAX, 'Write a reply.', 'A reply');

/** A card's words, and optionally one finished photo of mine (ADR-031) to nail with them. */
export const postCardSchema = z.object({ body: cardBodySchema, photoId: z.uuid().optional() });
export const postReplySchema = z.object({ body: replyBodySchema });

/** Page size for the Fence. */
export const FENCE_PAGE_SIZE = 20;
export const FENCE_MAX_PAGE_SIZE = 50;
/** Replies shown under a card (oldest first). A card's replies are capped, so a card cannot become a thread. */
export const REPLIES_PER_CARD = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const idParamSchema = z.string().regex(UUID);

/** Cursor for keyset pagination: opaque to clients and parsed strictly (by the fence module) before it reaches a query. */
export const cursorParamSchema = z
  .string()
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);

export const fenceQuerySchema = z.object({
  cursor: cursorParamSchema.optional(),
  limit: z.coerce.number().int().min(1).max(FENCE_MAX_PAGE_SIZE).optional(),
});

/** Post Card reactions. Yo is the default; each person has at most one reaction on a card. */
export const REACTION_KINDS = ['yo', 'laugh', 'fire', 'popcorn', 'love'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

/** Give (`on: true`, with an optional kind, default Yo) or take back (`on: false`) your reaction. */
export const yoSchema = z.object({ on: z.boolean(), kind: z.enum(REACTION_KINDS).optional() });

export const cardActionSchema = z.object({ action: z.enum(['approve']) });
