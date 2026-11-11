import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authHandlers } from '@/modules/auth';
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from '@/modules/auth/disposable-email';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { call, freshAuthState, uniqueUser, userByEmail, type TestKit } from '../helpers/auth';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

describe('throwaway email services are recognised', () => {
  it('catches well-known ones, and their subdomains', () => {
    for (const email of [
      'a@mailinator.com',
      'a@10minutemail.com',
      'a@guerrillamail.com',
      'a@inbox.mailinator.com',
      'a@x.y.mailinator.com',
    ]) {
      expect(isDisposableEmail(email), email).toBe(true);
    }
  });

  it('never catches real providers people in India use', () => {
    for (const email of [
      'a@gmail.com',
      'a@yahoo.com',
      'a@yahoo.co.in',
      'a@outlook.com',
      'a@hotmail.com',
      'a@rediffmail.com',
      'a@icloud.com',
      'a@proton.me',
      'a@zoho.com',
      'a@chiranjitkarmakar.com',
    ]) {
      expect(isDisposableEmail(email), email).toBe(false);
    }
  });

  it('a lookalike that only ends the same way is not caught', () => {
    // "xmailinator.com" is not "mailinator.com": only whole domain parts count. (Careful picking an example: lots of
    // lookalikes, like notmailinator.com, are throwaway services themselves and ARE on the list.)
    expect(isDisposableEmail('a@xmailinator.com')).toBe(false);
  });
});

describe('sign-up refuses a throwaway address', () => {
  it('on the email field, with a calm message, and no account or email is made', async () => {
    const u = { ...uniqueUser(), email: `someone.${Date.now()}@mailinator.com` };
    const r = await call(authHandlers.signup, 'POST', '/api/auth/signup', u);
    await flushBackground();
    expect(r.status).toBe(422);
    expect(r.data.error?.fields?.email).toBe(DISPOSABLE_EMAIL_MESSAGE);
    expect(await userByEmail(u.email)).toBeUndefined();
    expect(kit.mailer.sent).toHaveLength(0);
  });

  it('a normal address still signs up as before', async () => {
    const u = uniqueUser();
    const r = await call(authHandlers.signup, 'POST', '/api/auth/signup', u);
    await flushBackground();
    expect(r.status).toBeLessThan(300);
    expect(await userByEmail(u.email)).toBeDefined();
  });
});
