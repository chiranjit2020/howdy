import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, short-lived permission to upload ONE file to ONE key (the local driver's version of a signed URL). It says which key,
 * which content type and exactly how many bytes; it expires; and it is bound to AUTH_SECRET with a purpose label so it can never
 * be mistaken for any other token the app signs.
 */
export interface UploadClaims {
  key: string;
  contentType: string;
  size: number;
}

const PURPOSE = 'howdy:media-upload:v1';
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

const macKey = (secret: string) => createHmac('sha256', secret).update(PURPOSE).digest();
const mac = (secret: string, payload: string) =>
  createHmac('sha256', macKey(secret)).update(payload).digest();

export function signUploadToken(
  secret: string,
  claims: UploadClaims,
  ttlSec = 300,
  now: number = Date.now(),
): string {
  const payload = b64(JSON.stringify({ ...claims, exp: now + ttlSec * 1000 }));
  return `${payload}.${b64(mac(secret, payload))}`;
}

/** The claims if the token is genuine and not expired, else null (every failure looks the same). */
export function verifyUploadToken(
  secret: string,
  token: string,
  now: number = Date.now(),
): UploadClaims | null {
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const expected = mac(secret, payload);
  let given: Buffer;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<
      UploadClaims & { exp: number }
    >;
    if (
      typeof c.key !== 'string' ||
      typeof c.contentType !== 'string' ||
      typeof c.size !== 'number' ||
      typeof c.exp !== 'number' ||
      c.exp <= now
    )
      return null;
    return { key: c.key, contentType: c.contentType, size: c.size };
  } catch {
    return null;
  }
}
