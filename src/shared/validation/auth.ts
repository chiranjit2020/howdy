import { z } from 'zod';
import { LIMITS } from '../limits';
import { appealTextSchema } from './moderation';
import { displayNameSchema } from './profile';
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
  // Fixed words under /whispers/… and /api/whispers/…, where a call sign would otherwise land on the same URL.
  'unread',
  'held',
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

export const INVALID_EMAIL = 'Enter a valid email address.';

/** One part of a domain name: letters, digits and inner hyphens, 1–63 characters. */
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * What z.email() lets through but no real inbox needs: a domain part that starts or ends with a hyphen (`a@b-.com`),
 * a local part over 64 characters (RFC 5321), and punycode (`xn--…`) domains. Punycode is how look-alike (homograph)
 * domains are written in ASCII; Howdy is ASCII-only for emails, so it is refused rather than displayed.
 */
function wellFormedParts(email: string): boolean {
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const labels = email.slice(at + 1).split('.');
  return (
    local.length <= 64 &&
    labels.every((l) => DOMAIN_LABEL.test(l) && !l.startsWith('xn--')) &&
    !allDigits(local, labels)
  );
}

/**
 * Throwaway-looking: digits only on both sides of the @, ignoring the ending (`123@123.com`, `42@7.co.in`). A product
 * decision (2026-09-27). Narrow on purpose: digits on ONE side are real (`12345@qq.com`, `me@163.com`) and stay allowed.
 */
function allDigits(local: string, labels: string[]): boolean {
  const name = labels.slice(0, -1).filter((l) => !/^(co|com|net|org|ac|gov|edu)$/.test(l));
  return /^\d+$/.test(local) && name.length > 0 && name.every((l) => /^\d+$/.test(l));
}

/**
 * The one email rule, used by sign-up, the sign-up form and every "send me an email" form. Trimmed and lowercased
 * first, so what is stored is always the normalised form. Rejects: no @, several @, missing or dotless domain
 * (`user@localhost`), IP literals, consecutive or edge dots, spaces, quotes and other unusual characters, non-ASCII,
 * over 254 characters — all with the same friendly message.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That email is too long.')
  .pipe(z.email(INVALID_EMAIL).refine(wellFormedParts, INVALID_EMAIL));

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
    'That password is too common. Pick something less guessable.',
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

export const IDENTITY_PASSWORD_MESSAGE = 'Your password should not contain your email or handle.';
export const ACCEPT_TERMS_MESSAGE =
  'Please confirm you are 18 or older and agree to the Terms and Privacy Policy.';

/** `displayName` is optional: left out, the Ranch is named after the call sign (the same as before this field existed). */
export const signUpSchema = z
  .object({
    email: emailSchema,
    handle: handleSchema,
    password: passwordSchema,
    displayName: displayNameSchema.optional(),
    /** The "18 or older, and I agree to the Terms and Privacy Policy" box. Must be ticked; recorded with the versions. */
    acceptTerms: z.literal(true, { error: ACCEPT_TERMS_MESSAGE }),
    /**
     * The invite code the person arrived with (ADR-045). Deliberately loose: a broken or stale link must never stop
     * anyone signing up, and the response must not say whether it worked.
     */
    invite: z.string().max(40).optional(),
  })
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
    .min(1, 'Enter your handle or email.')
    .max(254)
    // Control characters (notably NUL, which Postgres refuses in text) can never be part of a real identifier.
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'Enter your handle or email.'),
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX),
});

/**
 * A suspended person's appeal (ADR-023). They cannot hold a session, so the appeal proves who they are the same way
 * signing in does: the same identifier and password, checked the same way, before anything is said about the account.
 */
export const appealSchema = loginSchema.extend({ text: appealTextSchema });

/** Closing my own account: the password again, so an open session alone is not enough (ADR-027). */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX),
});

/** "Download my data" re-checks the password exactly like deleting the account (ADR-037). */
export const exportDataSchema = deleteAccountSchema;

export const emailOnlySchema = z.object({ email: emailSchema });

/** 32 random bytes as base64url is 43 chars. Anything wildly different is rejected before touching the database. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'That link is not valid.');

export const verifyEmailSchema = z.object({ token: tokenSchema });

export const resetPasswordSchema = z.object({ token: tokenSchema, password: passwordSchema });

// ─── Two-step sign-in (ADR-040) ──────────────────────────────────────────────────────────────────────────────────────

/** An authenticator-app code (6 digits) or a recovery code (`abcde-fghjk`); the server tells them apart. */
export const secondStepCodeSchema = z
  .string()
  .trim()
  .min(1, 'Enter the code.')
  .max(32, 'That code isn’t right.')
  .refine((s) => /^[\da-z\s-]+$/i.test(s), 'That code isn’t right.');

/** `<user id>.<expires ms>.<mac>` — see factor-crypto.ts. */
export const ticketSchema = z.string().regex(/^[0-9a-f-]{36}\.\d{13}\.[A-Za-z0-9_-]{43}$/);

/** Sign in, keep or close from the sign-in page: password (+ code when two-step is on), or a ticket. */
export const signInProofSchema = z.union([
  z.strictObject({ ticket: ticketSchema }),
  loginSchema.extend({ code: secondStepCodeSchema.optional() }),
]);

export const appealProofSchema = z.union([
  z.strictObject({ ticket: ticketSchema, text: appealTextSchema }),
  appealSchema.extend({ code: secondStepCodeSchema.optional() }),
]);

/** Changing sign-in security asks for the password again. */
export const passwordOnlySchema = deleteAccountSchema;

export const confirmAppSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

const b64url = (max: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]*$/)
    .max(max);

/**
 * What the browser sends back from a passkey prompt. Only the shape is checked here (sizes bounded); the WebAuthn
 * library checks the contents and signatures.
 */
const credentialBase = {
  id: b64url(1366).min(16),
  rawId: b64url(1366).min(16),
  type: z.literal('public-key'),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
};

export const passkeyRegistrationSchema = z.object({
  challengeId: z.uuid(),
  response: z.object({
    ...credentialBase,
    response: z.object({
      clientDataJSON: b64url(8192),
      attestationObject: b64url(32768),
      authenticatorData: b64url(32768).optional(),
      transports: z.array(z.string().max(32)).max(8).optional(),
      publicKeyAlgorithm: z.number().int().optional(),
      publicKey: b64url(8192).optional(),
    }),
  }),
});

export const passkeySignInSchema = z.object({
  challengeId: z.uuid(),
  response: z.object({
    ...credentialBase,
    response: z.object({
      clientDataJSON: b64url(8192),
      authenticatorData: b64url(8192),
      signature: b64url(2048),
      userHandle: b64url(256).optional(),
    }),
  }),
});
