import { LIMITS } from '@/shared/limits';

/*
 * Username suggestions, used by the sign-up form (in the browser) and the Google sign-up page (on the server). Kept out
 * of signup-aids.tsx on purpose: that file is browser-only ('use client'), and the server cannot call a function from it.
 */

/**
 * A username made from the email's first part ("Rick.Sen+howdy@…" → "rick_sen"), so most people never have to think
 * of one. Only a suggestion: it fills the box until the person types their own. Empty when nothing usable is left.
 */
export function suggestHandle(email: string): string {
  return handleFromText((email.split('@')[0] ?? '').split('+')[0] ?? '');
}

/** A username made from any words ("Rick Sen" → "rick_sen"): letters and digits kept, everything else one underscore. */
export function handleFromText(text: string): string {
  let h = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents off: "José" → "jose"
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, LIMITS.HANDLE_MAX);
  if (h && h.length < LIMITS.HANDLE_MIN) h = `${h}_howdy`.slice(0, LIMITS.HANDLE_MAX);
  return h;
}
