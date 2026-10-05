import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { getEnv } from '@/platform/config/env';

/**
 * Keys for two-step sign-in (ADR-040), each derived from AUTH_SECRET with HKDF under its own label, so no two uses ever
 * share a key and none of them is AUTH_SECRET itself.
 */
function subkey(label: string): Buffer {
  return Buffer.from(hkdfSync('sha256', getEnv().AUTH_SECRET, 'howdy', `howdy:${label}`, 32));
}

// ─── the authenticator-app secret, sealed at rest ────────────────────────────────────────────────────────────────────

/** AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>`, base64url. Bound to the account, so a sealed secret cannot be moved. */
export function sealSecret(plain: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', subkey('totp-secret'), iv);
  cipher.setAAD(Buffer.from(userId));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), body]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

/** Throws if the value was tampered with, sealed for another account, or under another AUTH_SECRET. */
export function openSecret(sealed: string, userId: string): string {
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || body === undefined) throw new Error('bad sealed secret');
  const decipher = createDecipheriv('aes-256-gcm', subkey('totp-secret'), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}

// ─── recovery codes ──────────────────────────────────────────────────────────────────────────────────────────────────

/** No 0/o, 1/l/i: easy to read off paper and type on a phone. 31 symbols × 10 = ~49 bits per code. */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const RECOVERY_CODE_COUNT = 10;

/** `abcde-fghjk`. */
export function newRecoveryCode(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** What a typed recovery code is compared as: lower case, no spaces or dashes. */
export function normaliseRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[\s-]/g, '');
}

export function looksLikeRecoveryCode(input: string): boolean {
  return new RegExp(`^[${RECOVERY_ALPHABET}]{10}$`).test(normaliseRecoveryCode(input));
}

/**
 * Keyed hash (HMAC-SHA256): with ~49 bits per code a plain hash could be brute-forced from a leaked database; without
 * AUTH_SECRET a leaked hash is useless.
 */
export function recoveryCodeHash(input: string): Buffer {
  return createHmac('sha256', subkey('recovery-code')).update(normaliseRecoveryCode(input)).digest();
}

// ─── the sign-in ticket ──────────────────────────────────────────────────────────────────────────────────────────────

/** How long a ticket lasts: long enough to write an appeal, short enough to be useless if it leaks later. */
export const TICKET_TTL_MS = 15 * 60_000;

/**
 * Proof that someone just signed in completely (password plus second step, or a passkey) but the account could not
 * open a session (suspended, closing). Lets the sign-in page appeal, keep or close the account WITHOUT asking for the
 * password and a fresh code again — an app code can only be used once. `<userId>.<expiresMs>.<mac>`.
 */
export function issueTicket(userId: string, nowMs: number = Date.now()): string {
  const body = `${userId}.${nowMs + TICKET_TTL_MS}`;
  return `${body}.${createHmac('sha256', subkey('sign-in-ticket')).update(body).digest('base64url')}`;
}

/** The account id a ticket proves, or null (forged, altered, expired, malformed). */
export function readTicket(ticket: string, nowMs: number = Date.now()): string | null {
  const m = /^([0-9a-f-]{36})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(ticket);
  if (!m) return null;
  const [, userId, expires, mac] = m;
  const want = createHmac('sha256', subkey('sign-in-ticket')).update(`${userId}.${expires}`).digest();
  const got = Buffer.from(mac!, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  if (Number(expires) <= nowMs) return null;
  return userId!;
}
