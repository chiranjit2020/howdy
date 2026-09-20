import { z } from 'zod';
import { LIMITS } from '../limits';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/**
 * Pure, browser-safe validation for auth input. The server re-validates everything with these same schemas
 * (client validation is a convenience, never a control). No I/O and no server imports here.
 */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128; // upper bound keeps hashing cost bounded

/** Handles that would be confusing or impersonate the product / routes. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'root',
  'howdy',
  'support',
  'help',
  'staff',
  'team',
  'security',
  'moderator',
  'mod',
  'system',
  'official',
  'api',
  'www',
  'me',
  'ranch',
  'fence',
  'tracks',
  'whispers',
  'workshop',
  'gate',
  'null',
  'undefined',
  'anonymous',
  'passerby',
]);

/** A small denylist of the most common passwords (lowercased). Length + this list, not composition rules (NIST 800-63B). */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  '1234567890',
  '12345678910',
  '0123456789',
  'qwertyuiop',
  'qwerty12345',
  'qwerty123456',
  'iloveyou12',
  'iloveyou123',
  'letmein1234',
  'welcome1234',
  'admin12345',
  'administrator',
  'abcdefghij',
  'abc1234567',
  'changeme123',
  'passw0rd123',
  'howdy12345',
  'howdyhowdy',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
  'football123',
  'baseball123',
  'monkey12345',
  'dragon12345',
  'sunshine123',
  'princess123',
  'superman123',
  'trustno1234',
]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That email is too long.')
  .pipe(z.email('Enter a valid email address.'));

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]+$/, 'Use only letters, numbers and underscores.')
  .min(LIMITS.HANDLE_MIN, `At least ${LIMITS.HANDLE_MIN} characters.`)
  .max(LIMITS.HANDLE_MAX, `At most ${LIMITS.HANDLE_MAX} characters.`)
  .refine((h) => !RESERVED_HANDLES.has(h), 'That call sign is reserved.');

/** Password rules independent of who is signing up. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`)
  .refine(
    (p) => !COMMON_PASSWORDS.has(p.toLowerCase()),
    'That knock is too common. Pick something less guessable.',
  );

/** Extra check that needs the account context: the password must not just be the email or handle. */
export function passwordMatchesIdentity(password: string, email: string, handle?: string): boolean {
  const p = password.toLowerCase();
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  return (
    p === email.toLowerCase() ||
    (local.length >= 4 && p.includes(local)) ||
    (!!handle && p.includes(handle.toLowerCase()) && handle.length >= 4)
  );
}

export const IDENTITY_PASSWORD_MESSAGE = 'Your knock should not contain your email or call sign.';

export const signUpSchema = z
  .object({ email: emailSchema, handle: handleSchema, password: passwordSchema })
  .superRefine((v, ctx) => {
    if (passwordMatchesIdentity(v.password, v.email, v.handle)) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: IDENTITY_PASSWORD_MESSAGE });
    }
  });

/** Login accepts an email or a handle. Deliberately loose: never tell the client which part was wrong. */
export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter your email or call sign.')
    .max(254)
    // Control characters (notably NUL, which Postgres refuses in text) can never be part of a real identifier.
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'Enter your email or call sign.'),
  password: z.string().min(1, 'Enter your secret knock.').max(PASSWORD_MAX),
});

export const emailOnlySchema = z.object({ email: emailSchema });

/** 32 random bytes as base64url is 43 chars. Anything wildly different is rejected before touching the database. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'That link is not valid.');

export const verifyEmailSchema = z.object({ token: tokenSchema });

export const resetPasswordSchema = z.object({ token: tokenSchema, password: passwordSchema });
