import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authHandlers } from '@/modules/auth';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import {
  PASSWORD,
  call,
  freshAuthState,
  loginAs,
  me,
  signUpUser,
  signedInUser,
  tokenFrom,
  tokenRows,
  uniqueUser,
  userByEmail,
  verifiedUser,
  type TestKit,
} from '../helpers/auth';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const NEW_PASSWORD = 'a completely different passphrase';
const verify = (token: string) => call(authHandlers.verifyEmail, 'POST', '/api/auth/verify-email', { token });
const reset = (token: string, password = NEW_PASSWORD) =>
  call(authHandlers.resetPassword, 'POST', '/api/auth/reset-password', { token, password });

async function requestReset(email: string): Promise<string> {
  kit.mailer.sent.length = 0;
  await call(authHandlers.forgotPassword, 'POST', '/api/auth/forgot-password', { email });
  await flushBackground();
  return tokenFrom(kit.mailer.lastTo(email)!.text);
}

describe('email verification tokens', () => {
  it('work exactly once', async () => {
    const u = uniqueUser();
    await signUpUser(kit, u);
    const token = tokenFrom(kit.mailer.lastTo(u.email)!.text);
    expect((await verify(token)).status).toBe(200);
    const again = await verify(token);
    expect(again.status).toBe(400);
    expect(again.data.error?.message).toMatch(/invalid or has expired/i);
  });

  it('cannot be raced: parallel uses of one token succeed at most once', async () => {
    const u = uniqueUser();
    await signUpUser(kit, u);
    const token = tokenFrom(kit.mailer.lastTo(u.email)!.text);
    const results = await Promise.all(Array.from({ length: 6 }, () => verify(token)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('expire after 24 hours', async () => {
    const u = uniqueUser();
    await signUpUser(kit, u);
    const token = tokenFrom(kit.mailer.lastTo(u.email)!.text);
    await getPool().query("update email_tokens set expires_at = now() - interval '1 second'");
    expect((await verify(token)).status).toBe(400);
    expect((await userByEmail(u.email))?.emailVerifiedAt).toBeNull();
  });

  it('a token from a different purpose (password reset) is not a verification token', async () => {
    const u = await verifiedUser(kit);
    const resetToken = await requestReset(u.email);
    expect((await verify(resetToken)).status).toBe(400);
  });

  it('an unknown or malformed token is rejected without leaking anything', async () => {
    const unknown = await verify('A'.repeat(43));
    expect(unknown.status).toBe(400);
    for (const bad of ['', 'short', 'x'.repeat(200), "' OR 1=1 --"]) {
      const r = await verify(bad);
      expect(r.status).toBe(422);
      expect(r.text).not.toMatch(/sql|syntax|stack/i);
    }
  });

  it('a newer token replaces the older one', async () => {
    const u = uniqueUser();
    await signUpUser(kit, u);
    const first = tokenFrom(kit.mailer.lastTo(u.email)!.text);
    await call(authHandlers.resendVerification, 'POST', '/api/auth/resend-verification', { email: u.email });
    await flushBackground();
    const second = tokenFrom(kit.mailer.lastTo(u.email)!.text);
    expect(second).not.toBe(first);
    expect((await verify(first)).status).toBe(400);
    expect((await verify(second)).status).toBe(200);
  });
});

describe('password reset', () => {
  it('sets the new password, and the old one stops working', async () => {
    const u = await verifiedUser(kit);
    const token = await requestReset(u.email);
    expect((await reset(token)).status).toBe(200);
    expect((await loginAs({ email: u.email, password: u.password })).status).toBe(401);
    const ok = await loginAs({ email: u.email, password: NEW_PASSWORD });
    expect(ok.status).toBe(200);
    expect((await me(ok.cookie)).status).toBe(200);
  });

  it('revokes EVERY existing session (a thief holding an old session is logged out)', async () => {
    const u = uniqueUser();
    await verifiedUser(kit, u);
    const laptop = await loginAs(u);
    const phone = await loginAs(u);
    const token = await requestReset(u.email);
    await reset(token);
    expect((await me(laptop.cookie)).status).toBe(401);
    expect((await me(phone.cookie)).status).toBe(401);
  });

  it('does not sign anyone in by itself', async () => {
    const u = await verifiedUser(kit);
    const token = await requestReset(u.email);
    const r = await reset(token);
    expect(r.res.headers.get('set-cookie')).toBeNull();
  });

  it('works exactly once, and parallel uses cannot both succeed', async () => {
    const u = await verifiedUser(kit);
    const token = await requestReset(u.email);
    const results = await Promise.all([
      reset(token, 'first new passphrase here'),
      reset(token, 'second new passphrase here'),
      reset(token, 'third new passphrase here'),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await reset(token)).status).toBe(400);
  });

  it('expires after 1 hour', async () => {
    const u = await verifiedUser(kit);
    const token = await requestReset(u.email);
    await getPool().query(
      "update email_tokens set expires_at = now() - interval '1 second' where purpose = 'reset_password'",
    );
    expect((await reset(token)).status).toBe(400);
    expect((await loginAs(u)).status).toBe(200); // password unchanged
  });

  it('a verification token cannot reset a password', async () => {
    const u = uniqueUser();
    await signUpUser(kit, u);
    const verificationToken = tokenFrom(kit.mailer.lastTo(u.email)!.text);
    expect((await reset(verificationToken)).status).toBe(400);
  });

  it('a newer reset request invalidates the older link', async () => {
    const u = await verifiedUser(kit);
    const first = await requestReset(u.email);
    const second = await requestReset(u.email);
    expect((await reset(first)).status).toBe(400);
    expect((await reset(second)).status).toBe(200);
  });

  it('a weak new password is rejected and does NOT burn the link', async () => {
    const u = await verifiedUser(kit);
    const token = await requestReset(u.email);
    expect((await reset(token, 'short')).status).toBe(422);
    expect((await reset(token, u.email.split('@')[0] + '-forever-2026')).status).toBe(422);
    expect((await reset(token)).status).toBe(200);
  });

  it('confirms control of the mailbox: an unverified account becomes verified', async () => {
    const u = uniqueUser();
    await signUpUser(kit, u);
    const token = await requestReset(u.email);
    await reset(token);
    expect((await userByEmail(u.email))?.emailVerifiedAt).toBeInstanceOf(Date);
    expect((await loginAs({ email: u.email, password: NEW_PASSWORD })).status).toBe(200);
  });

  it('tells the owner their knock was changed', async () => {
    const u = await verifiedUser(kit);
    const token = await requestReset(u.email);
    kit.mailer.sent.length = 0;
    await reset(token);
    await flushBackground();
    expect(kit.mailer.lastTo(u.email)?.subject).toMatch(/changed/i);
    expect(kit.mailer.lastTo(u.email)?.text).not.toContain(NEW_PASSWORD);
  });

  it('leaves no live reset tokens behind after success', async () => {
    const u = await verifiedUser(kit);
    const token = await requestReset(u.email);
    await reset(token);
    const rows = await tokenRows((await userByEmail(u.email))!.id);
    expect(rows.filter((r) => r.purpose === 'reset_password' && r.usedAt === null)).toHaveLength(0);
  });
});

describe('a signed-in user is unaffected by other people’s reset requests', () => {
  it('requesting a reset alone does not sign the user out or change the password', async () => {
    const u = await signedInUser(kit);
    await requestReset(u.email);
    expect((await me(u.cookie)).status).toBe(200);
    expect((await loginAs({ email: u.email, password: PASSWORD })).status).toBe(200);
  });
});
