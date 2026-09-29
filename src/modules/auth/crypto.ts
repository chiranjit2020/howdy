import { createHash, createHmac, randomBytes } from 'node:crypto';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

/**
 * Argon2id at the OWASP baseline (19 MiB, 2 passes, 1 lane). Raise here as hardware allows; hashes carry their own params.
 * `Algorithm` is an ambient const enum (unusable as a value under isolatedModules); Argon2id is 2. A test asserts the
 * output really is `$argon2id$`.
 */
const ARGON2 = { algorithm: 2 as Algorithm, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

/** Never throws: a malformed hash is simply "not a match". */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/**
 * A real Argon2id hash of a random secret. Login verifies against it when the account does not exist so that
 * "unknown account" costs the same as "wrong password" (no timing oracle for account existence).
 */
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(24).toString('base64url'));
  return dummy;
}

/** 256-bit random secret, URL-safe (43 chars). Only its hash is ever stored. */
export function newToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** Short stable digest for rate-limit keys and logs, so raw emails/identifiers never land in Redis keys or log lines. */
export function keyDigest(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 32);
}

/**
 * A keyed hash of a call sign, for holding back a deleted account's call sign without keeping the name (ADR-027). Keyed
 * with AUTH_SECRET so the stored value cannot be matched against a list of names by anyone without the secret.
 */
export function handleDigest(secret: string, handle: string): string {
  return createHmac('sha256', secret).update(`retired-handle:${handle.trim().toLowerCase()}`).digest('hex');
}
