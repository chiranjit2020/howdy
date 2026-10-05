import { describe, expect, it } from 'vitest';
import {
  RECOVERY_CODE_COUNT,
  TICKET_TTL_MS,
  issueTicket,
  looksLikeRecoveryCode,
  newRecoveryCode,
  normaliseRecoveryCode,
  openSecret,
  readTicket,
  recoveryCodeHash,
  sealSecret,
} from '@/modules/auth/factor-crypto';
import {
  base32Decode,
  base32Encode,
  hotp,
  matchTotp,
  newTotpSecret,
  totpCode,
  totpUri,
} from '@/modules/auth/totp';

/** RFC 4226 Appendix D / RFC 6238 Appendix B use this ASCII secret. */
const RFC_SECRET = Buffer.from('12345678901234567890');
const RFC_SECRET_B32 = base32Encode(RFC_SECRET);

describe('authenticator-app codes (RFC 6238)', () => {
  it('match the RFC 4226 HOTP test vectors', () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    expected.forEach((code, counter) => expect(hotp(RFC_SECRET, counter)).toBe(code));
  });

  it('match the RFC 6238 SHA-1 test vectors (last 6 digits of the 8-digit values)', () => {
    const vectors: [number, string][] = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ];
    for (const [sec, code] of vectors) expect(totpCode(RFC_SECRET_B32, sec * 1000)).toBe(code);
  });

  it('base32 round-trips, ignores spaces and case', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('mzxw 6ytb oi').toString()).toBe('foobar');
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s)).toHaveLength(20);
  });

  it('accepts one step either side of now, and nothing further', () => {
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30_000);
    for (const d of [-1, 0, 1]) {
      expect(matchTotp(RFC_SECRET_B32, hotp(RFC_SECRET, step + d), now, null)).toBe(step + d);
    }
    for (const d of [-3, -2, 2, 3]) {
      expect(matchTotp(RFC_SECRET_B32, hotp(RFC_SECRET, step + d), now, null)).toBeNull();
    }
  });

  it('never accepts a step at or before the last one used (no replay, no older code)', () => {
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30_000);
    const code = hotp(RFC_SECRET, step);
    expect(matchTotp(RFC_SECRET_B32, code, now, step - 1)).toBe(step);
    expect(matchTotp(RFC_SECRET_B32, code, now, step)).toBeNull();
    expect(matchTotp(RFC_SECRET_B32, hotp(RFC_SECRET, step - 1), now, step - 1)).toBeNull();
  });

  it('refuses anything that is not exactly six digits', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 345', '١٢٣٤٥٦']) {
      expect(matchTotp(RFC_SECRET_B32, bad, Date.now(), null)).toBeNull();
    }
  });

  it('builds the otpauth link apps understand', () => {
    const raw = totpUri('JBSWY3DPEHPK3PXP', 'rick');
    expect(raw.startsWith('otpauth://totp/Howdy%3Arick?')).toBe(true);
    const uri = new URL(raw);
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'Howdy',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
  });
});

describe('the sealed app secret', () => {
  const alice = '11111111-1111-4111-8111-111111111111';
  const bob = '22222222-2222-4222-8222-222222222222';

  it('round-trips, and the stored form does not contain the secret', () => {
    const secret = newTotpSecret();
    const sealed = sealSecret(secret, alice);
    expect(sealed).not.toContain(secret);
    expect(openSecret(sealed, alice)).toBe(secret);
    expect(sealSecret(secret, alice)).not.toBe(sealed); // fresh IV every time
  });

  it('cannot be opened for another account (moved between rows) or after tampering', () => {
    const sealed = sealSecret(newTotpSecret(), alice);
    expect(() => openSecret(sealed, bob)).toThrow();
    const parts = sealed.split('.');
    const body = Buffer.from(parts[3]!, 'base64url');
    body[0]! ^= 1;
    parts[3] = body.toString('base64url');
    expect(() => openSecret(parts.join('.'), alice)).toThrow();
    expect(() => openSecret('v2.a.b.c', alice)).toThrow();
  });
});

describe('recovery codes', () => {
  it('are 10 characters of an unambiguous alphabet, shown as two groups', () => {
    const codes = Array.from({ length: 200 }, newRecoveryCode);
    for (const c of codes) {
      expect(c).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
      expect(looksLikeRecoveryCode(c)).toBe(true);
    }
    expect(new Set(codes).size).toBe(codes.length);
    expect(RECOVERY_CODE_COUNT).toBe(10);
  });

  it('match however they are typed (case, spaces, dash), and only themselves', () => {
    const c = newRecoveryCode();
    const typed = ` ${c.toUpperCase().replace('-', ' ')} `;
    expect(normaliseRecoveryCode(typed)).toBe(c.replace('-', ''));
    expect(recoveryCodeHash(typed).equals(recoveryCodeHash(c))).toBe(true);
    expect(recoveryCodeHash(newRecoveryCode()).equals(recoveryCodeHash(c))).toBe(false);
  });

  it('a 6-digit app code is never mistaken for a recovery code', () => {
    expect(looksLikeRecoveryCode('123456')).toBe(false);
    expect(looksLikeRecoveryCode('1234567890')).toBe(false); // 0 and 1 are not in the alphabet
  });
});

describe('the sign-in ticket', () => {
  const id = '33333333-3333-4333-8333-333333333333';

  it('proves the account it was issued for, until it expires', () => {
    const now = 1_800_000_000_000;
    const t = issueTicket(id, now);
    expect(readTicket(t, now)).toBe(id);
    expect(readTicket(t, now + TICKET_TTL_MS - 1)).toBe(id);
    expect(readTicket(t, now + TICKET_TTL_MS)).toBeNull();
  });

  it('cannot be altered to name another account or live longer', () => {
    const now = 1_800_000_000_000;
    const [, exp, mac] = issueTicket(id, now).split('.');
    expect(readTicket(`44444444-4444-4444-8444-444444444444.${exp}.${mac}`, now)).toBeNull();
    expect(readTicket(`${id}.${Number(exp) + 60_000}.${mac}`, now)).toBeNull();
    expect(readTicket(`${id}.${exp}.${'A'.repeat(43)}`, now)).toBeNull();
    expect(readTicket('nonsense', now)).toBeNull();
  });
});
