import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  handleSchema,
  loginSchema,
  passwordMatchesIdentity,
  passwordSchema,
  resetPasswordSchema,
  signUpSchema,
  tokenSchema,
} from '@/shared/validation/auth';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;

describe('handleSchema', () => {
  it('normalises to lowercase and accepts letters, digits, underscore', () => {
    expect(handleSchema.parse('  Chiranjit_01 ')).toBe('chiranjit_01');
  });
  it.each(['ab', 'a'.repeat(25), 'has space', 'dash-ed', 'dot.ted', 'émoji', '<script>', ''])(
    'rejects %j',
    (h) => {
      expect(ok(handleSchema, h)).toBe(false);
    },
  );
  it.each(['admin', 'Howdy', 'SUPPORT', 'moderator', 'workshop'])('rejects reserved handle %j', (h) => {
    expect(ok(handleSchema, h)).toBe(false);
  });
});

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Foo@Example.COM ')).toBe('foo@example.com');
  });
  it.each(['nope', 'a@', '@b.com', 'a b@c.com', `${'a'.repeat(250)}@x.com`])('rejects %j', (e) => {
    expect(ok(emailSchema, e)).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a long passphrase with no composition rules', () => {
    expect(ok(passwordSchema, 'correct horse battery staple')).toBe(true);
    expect(ok(passwordSchema, 'aaaaaaaaaaaz')).toBe(true);
  });
  it('enforces 10..128 characters', () => {
    expect(ok(passwordSchema, 'x'.repeat(9))).toBe(false);
    expect(ok(passwordSchema, 'x'.repeat(10))).toBe(true);
    expect(ok(passwordSchema, 'x'.repeat(128))).toBe(true);
    expect(ok(passwordSchema, 'x'.repeat(129))).toBe(false);
  });
  it('rejects very common passwords regardless of case', () => {
    expect(ok(passwordSchema, 'Password123')).toBe(false);
    expect(ok(passwordSchema, 'QWERTYUIOP')).toBe(false);
  });
});

describe('passwordMatchesIdentity', () => {
  it('flags passwords built from the email or handle', () => {
    expect(passwordMatchesIdentity('chiranjit2026!!', 'chiranjit@example.com', 'x_handle')).toBe(true);
    expect(passwordMatchesIdentity('my-super-rider-pw', 'a@b.com', 'super_rider')).toBe(false);
    expect(passwordMatchesIdentity('xx_rider_xx1', 'a@b.com', 'rider')).toBe(true);
    expect(passwordMatchesIdentity('correct horse battery', 'ann@example.com', 'ann')).toBe(false); // too short to count
  });
});

describe('signUpSchema', () => {
  it('reports the identity rule on the password field', () => {
    const r = signUpSchema.safeParse({
      email: 'chiranjit@example.com',
      handle: 'chiru',
      password: 'chiranjit-is-great',
      acceptTerms: true,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['password']);
  });
  it('accepts a good sign-up and normalises fields', () => {
    expect(
      signUpSchema.parse({
        email: 'A@Example.com',
        handle: 'Cool_Cat',
        password: 'correct horse battery staple',
        acceptTerms: true,
      }),
    ).toEqual({
      email: 'a@example.com',
      handle: 'cool_cat',
      password: 'correct horse battery staple',
      acceptTerms: true,
    });
  });
  it('the Display name is optional, and screened like any name when given', () => {
    const base = {
      email: 'a@example.com',
      handle: 'cool_cat',
      password: 'correct horse battery staple',
      acceptTerms: true,
    };
    expect(signUpSchema.parse({ ...base, displayName: '  Cool   Cat ' }).displayName).toBe('Cool Cat');
    expect(ok(signUpSchema, base)).toBe(true); // left out: the Ranch takes the call sign as its name
    for (const bad of ['', 'x'.repeat(200), 'see https://spam.example']) {
      expect(ok(signUpSchema, { ...base, displayName: bad }), bad).toBe(false);
    }
  });
  it('the "18 or older and I agree" box must be exactly true', () => {
    const base = { email: 'a@example.com', handle: 'cool_cat', password: 'correct horse battery staple' };
    for (const acceptTerms of [undefined, false, 'true', 1, 'yes']) {
      const r = signUpSchema.safeParse({ ...base, acceptTerms });
      expect(r.success, String(acceptTerms)).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(['acceptTerms']);
      expect(r.error?.issues[0]?.message).toMatch(/18 or older/);
    }
  });
});

describe('loginSchema / tokenSchema / resetPasswordSchema', () => {
  it('login is loose about what identifier is, but bounded', () => {
    expect(ok(loginSchema, { identifier: 'a@b.com', password: 'x' })).toBe(true);
    expect(ok(loginSchema, { identifier: 'chiru', password: 'x' })).toBe(true);
    expect(ok(loginSchema, { identifier: '', password: 'x' })).toBe(false);
    // control characters (Postgres rejects NUL in text, which used to surface as a 500)
    for (const bad of ['admin\u0000', 'a\nb@example.com', 'x\u007f']) {
      expect(ok(loginSchema, { identifier: bad, password: 'x' })).toBe(false);
    }
    expect(ok(loginSchema, { identifier: 'a', password: 'x'.repeat(129) })).toBe(false);
  });
  it('tokens must be exactly 43 base64url chars', () => {
    expect(ok(tokenSchema, 'A'.repeat(43))).toBe(true);
    for (const t of ['', 'short', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}!`, `${'A'.repeat(42)}=`])
      expect(ok(tokenSchema, t)).toBe(false);
  });
  it('reset requires a valid token and a valid password', () => {
    expect(ok(resetPasswordSchema, { token: 'A'.repeat(43), password: 'correct horse battery staple' })).toBe(
      true,
    );
    expect(ok(resetPasswordSchema, { token: 'A'.repeat(43), password: 'short' })).toBe(false);
  });
});
