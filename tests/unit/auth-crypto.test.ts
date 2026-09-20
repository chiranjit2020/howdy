import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  dummyPasswordHash,
  hashPassword,
  hashToken,
  keyDigest,
  newToken,
  verifyPassword,
} from '@/modules/auth/crypto';

describe('password hashing', () => {
  it('produces Argon2id PHC strings with the expected parameters, never containing the password', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(h).not.toContain('correct horse');
  });

  it('uses a fresh salt each time and verifies only the right password', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same password here'),
      hashPassword('same password here'),
    ]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, 'same password here')).toBe(true);
    expect(await verifyPassword(a, 'same password herf')).toBe(false);
    expect(await verifyPassword(a, '')).toBe(false);
  });

  it('treats a malformed stored hash as a non-match instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'whatever password')).toBe(false);
    expect(await verifyPassword('', 'whatever password')).toBe(false);
  });

  it('has a real Argon2id dummy hash (same cost as a real account) that no guess matches', async () => {
    const d = await dummyPasswordHash();
    expect(d).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(d, 'correct horse battery staple')).toBe(false);
    expect(await dummyPasswordHash()).toBe(d); // computed once
  });
});

describe('tokens', () => {
  it('are 256-bit URL-safe secrets whose stored form is only their SHA-256', () => {
    const { token, hash } = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toHaveLength(32);
    expect(hash.equals(createHash('sha256').update(token).digest())).toBe(true);
    expect(hash.toString('base64url')).not.toBe(token);
    expect(hashToken(token).equals(hash)).toBe(true);
  });

  it('do not repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, () => newToken().token));
    expect(seen.size).toBe(500);
  });
});

describe('keyDigest', () => {
  it('is stable, case/space-insensitive, and never echoes the input', () => {
    expect(keyDigest(' Foo@Example.com ')).toBe(keyDigest('foo@example.com'));
    expect(keyDigest('a')).not.toBe(keyDigest('b'));
    expect(keyDigest('foo@example.com')).toMatch(/^[0-9a-f]{32}$/);
  });
});
