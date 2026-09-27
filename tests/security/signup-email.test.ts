import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authHandlers } from '@/modules/auth';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { PASSWORD, call, freshAuthState, stable, type TestKit } from '../helpers/auth';
import { INVALID_EMAILS, VALID_EMAILS } from '../helpers/emails';

/*
 * "Email Validation Security Test (P0)": the sign-up API itself refuses malformed addresses, whatever the browser does.
 * Every request here goes straight to the route handler, as a crafted cURL/Postman request would, with no form in front.
 */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

let n = 0;
const signUp = (email: unknown, handle = `mail_${++n}`) =>
  call(authHandlers.signup, 'POST', '/api/auth/signup', {
    email,
    handle,
    password: PASSWORD,
    acceptTerms: true,
  });
const users = async () =>
  (await getPool().query('select email from users order by email')).rows as { email: string }[];

describe('sign-up refuses malformed emails on the server', () => {
  it.each(INVALID_EMAILS.map((e) => [e]))(
    '%j → 422, a field error, no account and no mail',
    async (email) => {
      const r = await signUp(email);
      await flushBackground();
      expect(r.status).toBe(422);
      expect(r.data.error?.code).toBe('VALIDATION_FAILED');
      expect(r.data.error?.fields?.email).toMatch(
        /^(Enter a valid email address\.|That email is too long\.)$/,
      );
      expect(await users()).toEqual([]);
      expect(kit.mailer.sent).toHaveLength(0);
    },
  );

  it('refuses an email that is not a string at all (number, array, object, null, missing)', async () => {
    for (const email of [12345, ['a@example.com'], { $ne: '' }, null, undefined]) {
      const r = await signUp(email);
      expect(r.status, JSON.stringify(email)).toBe(422);
      expect(r.data.error?.fields?.email, JSON.stringify(email)).toBeTruthy();
    }
    expect(await users()).toEqual([]);
  });

  it('never echoes what was sent: injection- and script-shaped input gets the same fixed message', async () => {
    const bad = ['<script>alert(1)</script>@example.com', "'; drop table users; --@example.com"];
    const [a, b] = [await signUp(bad[0]), await signUp(bad[1])];
    for (const [r, input] of [
      [a, bad[0]!],
      [b, bad[1]!],
    ] as const) {
      expect(r.text).not.toContain('<script>');
      expect(r.text).not.toContain(input);
    }
    expect(stable(a.data)).toBe(stable(b.data));
    expect((await getPool().query("select to_regclass('public.users') as t")).rows[0].t).toBe('users'); // still there
  });
});

describe('sign-up accepts real addresses, normalised', () => {
  it.each(VALID_EMAILS.map(([raw, stored]) => [raw, stored]))('%j → stored as %j', async (raw, stored) => {
    const r = await signUp(raw);
    await flushBackground();
    expect(r.status).toBe(202);
    expect(await users()).toEqual([{ email: stored }]);
  });

  it('the same address in another case or with spaces is the same account: one row, and an identical reply', async () => {
    const first = await signUp('Priya.Das@Example.com', 'priya_one');
    const again = await signUp('  priya.das@EXAMPLE.COM ', 'priya_two');
    await flushBackground();
    expect(first.status).toBe(202);
    expect(again.status).toBe(202);
    expect(stable(again.data)).toBe(stable(first.data)); // nothing tells the second caller the address is taken
    expect(await users()).toEqual([{ email: 'priya.das@example.com' }]);
    expect(kit.mailer.sent.map((m) => m.to)).toEqual(['priya.das@example.com', 'priya.das@example.com']);
    // Not confirmed yet, so the repeat just sends the confirmation link again (a confirmed one would get "you already
    // have an account" — see auth-enumeration.test.ts). Either way there is no second account.
    for (const m of kit.mailer.sent) expect(m.subject).toMatch(/^Confirm your email/);
  });
});
