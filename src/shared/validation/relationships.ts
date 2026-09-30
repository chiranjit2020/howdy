import { z } from 'zod';
import { handleParamSchema } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/** Everything one person can do to their relationship with another. One endpoint, one closed set of verbs. */
export const RELATIONSHIP_ACTIONS = [
  'request', // ask to join their Posse (or agree, if they already asked)
  'accept',
  'decline',
  'cancel', // withdraw my pending request
  'leave', // leave a Posse
  'close', // privately mark as Close Posse
  'unclose',
  'scout',
  'unscout',
  'mute',
  'unmute',
  'restrict',
  'unrestrict',
  'block',
  'unblock',
] as const;
export type RelationshipAction = (typeof RELATIONSHIP_ACTIONS)[number];

export const relationshipActionSchema = z.object({ action: z.enum(RELATIONSHIP_ACTIONS) });

/** "Ask by call sign": the handle is shape-checked and lower-cased before it goes anywhere near a query. */
export const askByHandleSchema = z.object({ handle: z.string().pipe(handleParamSchema) });

/** "Not now" on a Pal suggestion (ADR-029). */
export const dismissSuggestionSchema = z.object({ handle: z.string().pipe(handleParamSchema) });
