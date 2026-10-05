import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Authenticator-app codes: TOTP (RFC 6238) with the settings every app understands — HMAC-SHA1, 6 digits, 30-second
 * steps. Pure functions with no I/O, so they are checked against the RFC's own test vectors (and the e2e tests can
 * compute a code the way a phone would).
 */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SEC = 30;
/** Accept the step before and after "now" as well: phone clocks drift, and typing a code takes a few seconds. */
export const TOTP_WINDOW = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error('not base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret (the size RFC 4226 recommends for SHA-1), base32 as apps expect it. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226): the code for one counter value. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return bin.toString().padStart(digits, '0');
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SEC);
}

/** The code an app shows at `nowMs` for a base32 secret. */
export function totpCode(secretBase32: string, nowMs: number = Date.now()): string {
  return hotp(base32Decode(secretBase32), totpStep(nowMs));
}

/**
 * Which step `code` is valid for (within the drift window), or null. Steps at or before `lastStep` never match, so a
 * code that was already used — or an older one — is refused even if it is still on someone's screen.
 */
export function matchTotp(
  secretBase32: string,
  code: string,
  nowMs: number,
  lastStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const now = totpStep(nowMs);
  const given = Buffer.from(code);
  let found: number | null = null;
  // Check every step in the window (no early exit), so timing does not say which one matched.
  for (let step = now - TOTP_WINDOW; step <= now + TOTP_WINDOW; step++) {
    const ok = timingSafeEqual(Buffer.from(hotp(secret, step)), given);
    if (ok && (lastStep === null || step > lastStep) && found === null) found = step;
  }
  return found;
}

/** The otpauth:// link an authenticator app opens or scans (Key Uri Format). */
export function totpUri(secretBase32: string, account: string, issuer = 'Howdy'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SEC),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
