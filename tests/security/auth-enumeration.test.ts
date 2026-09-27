import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authHandlers } from '@/modules/auth';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import {
  PASSWORD,
  call,
  freshAuthState,
  signUpUser,
  stable,
  uniqueUser,
  verifiedUser,
  type TestKit,
} from '../helpers/auth';

// Count real password verifications so we can prove "unknown account" costs the same as "wrong password".
const verifyCalls = vi.hoisted(() => ({ n: 0, hashes: [] as string[] }));
vi.mock('@/modules/auth/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/auth/crypto')>();
  return {
    ...actual,
    verifyPassword: (hash: string, pw: string) => {
      verifyCalls.n += 1;
      verifyCalls.hashes.push(hash);
      return actual.verifyPassword(hash, pw);
    },
  };
});

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
  verifyCalls.n = 0;
});
afterAll(async () => {
  await getPool().end();
});

const usersCount = async () =>
  (await getPool().query('select count(*)::int as n from users')).rows[0].n as number;

describe('sign up does not reveal whether an email is registered', () => {
  it('a new email and an already-registered email get byte-identical responses', async () => {
    const existing = await verifiedUser(kit);
    kit.mailer.sent.length = 0;

    const fresh = await signUpUser(kit, uniqueUser());
    const dup = await signUpUser(kit, { ...uniqueUser(), email: existing.email });

    expect(dup.response.status).toBe(fresh.response.status);
    expect(stable(dup.response.data)).toBe(stable(fresh.response.data));
    expect(dup.response.res.headers.get('set-cookie')).toBeNull(); // no session either way
  });

  it('the existing owner is told by email instead, and no second account is created', async () => {
    const existing = await verifiedUser(kit);
    kit.mailer.sent.length = 0;
    const before = await usersCount();
    await signUpUser(kit, { ...uniqueUser(), email: existing.email });
    expect(await usersCount()).toBe(before);
    expect(kit.mailer.sent).toHaveLength(1);
    expect(kit.mailer.sent[0]!.to).toBe(existing.email);
    expect(kit.mailer.sent[0]!.subject).toMatch(/already have a Howdy account/i);
    expect(kit.mailer.sent[0]!.text).not.toMatch(/token=/); // nothing to take over an account with
  });

  it('a duplicate sign-up cannot be used to claim a handle for someone else’s email', async () => {
    const existing = await verifiedUser(kit);
    const r = await signUpUser(kit, {
      email: existing.email,
      handle: 'sneaky_claim',
      password: PASSWORD,
      acceptTerms: true,
    });
    expect(r.response.status).toBe(202); // it reached the duplicate-email path, not a validation error
    expect(
      (await getPool().query("select count(*)::int as n from users where handle = 'sneaky_claim'")).rows[0].n,
    ).toBe(0);
  });

  it('an unverified existing email simply gets a fresh verification link', async () => {
    const u = uniqueUser();
    await signUpUser(kit, u);
    kit.mailer.sent.length = 0;
    const again = await signUpUser(kit, { ...uniqueUser(), email: u.email });
    expect(again.response.status).toBe(202);
    expect(kit.mailer.sent).toHaveLength(1);
    expect(kit.mailer.sent[0]!.subject).toMatch(/confirm your email/i);
  });

  it('email matching is case-insensitive (Foo@x.com is the same account as foo@x.com)', async () => {
    const existing = await verifiedUser(kit);
    const before = await usersCount();
    const r = await call(authHandlers.signup, 'POST', '/api/auth/signup', {
      ...uniqueUser(),
      email: existing.email.toUpperCase(),
    });
    await flushBackground();
    expect(r.status).toBe(202);
    expect(await usersCount()).toBe(before);
  });
});

describe('sign in does not reveal which accounts exist', () => {
  const login = (identifier: string, password: string) =>
    call(authHandlers.login, 'POST', '/api/auth/login', { identifier, password });

  it('unknown account and wrong password produce the same status and body', async () => {
    const u = await verifiedUser(kit);
    const wrong = await login(u.email, 'this is not the password');
    const unknown = await login('nobody-here@example.com', 'this is not the password');
    const unknownHandle = await login('no_such_handle', 'this is not the password');
    expect(wrong.status).toBe(401);
    expect(stable(unknown.data)).toBe(stable(wrong.data));
    expect(stable(unknownHandle.data)).toBe(stable(wrong.data));
    expect(unknown.status).toBe(wrong.status);
  });

  it('unknown accounts still pay for one real password verification (no timing oracle)', async () => {
    const u = await verifiedUser(kit);
    verifyCalls.n = 0;
    verifyCalls.hashes.length = 0;
    await login(u.email, 'this is not the password');
    const forKnown = verifyCalls.n;
    verifyCalls.n = 0;
    verifyCalls.hashes.length = 0;
    await login('nobody-here@example.com', 'this is not the password');
    expect(forKnown).toBe(1);
    expect(verifyCalls.n).toBe(1);
    // ...and against a REAL Argon2id hash with the same cost parameters, not a cheap placeholder that fails instantly
    expect(verifyCalls.hashes[0]).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('“email not verified” is only revealed after the correct password, never to a guesser', async () => {
    const u = uniqueUser();
    await signUpUser(kit, u);
    const guess = await login(u.email, 'a wrong guess entirely');
    expect(guess.data.error?.code).toBe('UNAUTHENTICATED');
    const proven = await login(u.email, u.password);
    expect(proven.data.error?.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('password reset and resend do not reveal whether an account exists', () => {
  for (const [name, handler, path] of [
    ['forgot-password', authHandlers.forgotPassword, '/api/auth/forgot-password'],
    ['resend-verification', authHandlers.resendVerification, '/api/auth/resend-verification'],
  ] as const) {
    it(`${name}: known and unknown emails get identical responses`, async () => {
      const u = uniqueUser();
      await signUpUser(kit, u);
      const known = await call(handler, 'POST', path, { email: u.email });
      const unknown = await call(handler, 'POST', path, { email: 'ghost@example.com' });
      await flushBackground();
      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(stable(unknown.data)).toBe(stable(known.data));
    });
  }

  it('forgot-password: only a real, active account is emailed, and never twice for the same request', async () => {
    const u = await verifiedUser(kit);
    kit.mailer.sent.length = 0;
    await call(authHandlers.forgotPassword, 'POST', '/api/auth/forgot-password', {
      email: 'ghost@example.com',
    });
    await flushBackground();
    expect(kit.mailer.sent).toHaveLength(0);
    await call(authHandlers.forgotPassword, 'POST', '/api/auth/forgot-password', { email: u.email });
    await flushBackground();
    expect(kit.mailer.sent).toHaveLength(1);
    expect(kit.mailer.sent[0]!.text).toContain('/lost-your-key/reset?token=');
  });

  it('resend-verification: a verified account is not re-sent a link', async () => {
    const u = await verifiedUser(kit);
    kit.mailer.sent.length = 0;
    await call(authHandlers.resendVerification, 'POST', '/api/auth/resend-verification', { email: u.email });
    await flushBackground();
    expect(kit.mailer.sent).toHaveLength(0);
  });

  it('email is sent after the response, so a mail failure cannot change what the caller sees', async () => {
    const { setMailer } = await import('@/platform/mailer');
    setMailer({ send: async () => Promise.reject(new Error('smtp down')) });
    const u = uniqueUser();
    const r = await signUpUser(kit, u);
    expect(r.response.status).toBe(202);
    const dupe = await signUpUser(kit, { ...uniqueUser(), email: u.email });
    expect(dupe.response.status).toBe(202);
  });
});
