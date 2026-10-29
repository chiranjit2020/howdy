import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authHandlers } from '@/modules/auth';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import {
  call,
  cookieFrom,
  freshAuthState,
  me,
  signUpUser,
  stable,
  tokenFrom,
  uniqueUser,
  type TestKit,
} from '../helpers/auth';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const codeFrom = (text: string) => {
  const m = /Your code: (\d{3}) (\d{3})/.exec(text);
  if (!m) throw new Error('no code in mail');
  return `${m[1]}${m[2]}`;
};
const sendCode = (email: string, code: string, ip = '203.0.113.7') =>
  call(authHandlers.verifyEmailCode, 'POST', '/api/auth/verify-email-code', { email, code }, { ip });
const otherCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

describe('the 6-digit code in the confirmation email', () => {
  it('confirms the email and signs straight in', async () => {
    const u = await signUpUser(kit);
    const mail = kit.mailer.lastTo(u.email)!;
    expect(mail.html).toContain('Verify account'); // the designed version travels with the text
    const r = await sendCode(u.email, codeFrom(mail.text));
    expect(r.status).toBe(200);
    expect(r.data.signedIn).toBe(true);
    const cookie = cookieFrom(r.res);
    expect(cookie).toBeDefined();
    expect((await me(cookie)).status).toBe(200);
  });

  it('accepts the code as it is written in the email ("482 913")', async () => {
    const u = await signUpUser(kit);
    const code = codeFrom(kit.mailer.lastTo(u.email)!.text);
    expect((await sendCode(u.email, `${code.slice(0, 3)} ${code.slice(3)}`)).status).toBe(200);
  });

  it('code and link are one secret: using one uses up the other', async () => {
    const u = await signUpUser(kit);
    const mail = kit.mailer.lastTo(u.email)!;
    expect((await sendCode(u.email, codeFrom(mail.text))).status).toBe(200);
    const link = await call(authHandlers.verifyEmail, 'POST', '/api/auth/verify-email', {
      token: tokenFrom(mail.text),
    });
    expect(link.status).toBe(400);
  });

  it('expires after 15 minutes (the link keeps working)', async () => {
    const u = await signUpUser(kit);
    const mail = kit.mailer.lastTo(u.email)!;
    await getPool().query(
      "update email_tokens set created_at = now() - interval '16 minutes' where purpose = 'verify_email'",
    );
    expect((await sendCode(u.email, codeFrom(mail.text))).status).toBe(400);
    const link = await call(authHandlers.verifyEmail, 'POST', '/api/auth/verify-email', {
      token: tokenFrom(mail.text),
    });
    expect(link.status).toBe(200);
  });

  it('a new email replaces the old code', async () => {
    const u = await signUpUser(kit);
    const first = codeFrom(kit.mailer.lastTo(u.email)!.text);
    await call(authHandlers.resendVerification, 'POST', '/api/auth/resend-verification', { email: u.email });
    await flushBackground();
    const second = codeFrom(kit.mailer.lastTo(u.email)!.text);
    if (first !== second) expect((await sendCode(u.email, first)).status).toBe(400);
    expect((await sendCode(u.email, second)).status).toBe(200);
  });

  it('allows only 5 tries per email, from any number of sources, then refuses even the right code', async () => {
    const u = await signUpUser(kit);
    const code = codeFrom(kit.mailer.lastTo(u.email)!.text);
    for (let i = 0; i < 5; i++) {
      expect((await sendCode(u.email, otherCode(code), `198.51.100.${i + 1}`)).status).toBe(400);
    }
    expect((await sendCode(u.email, code, '198.51.100.99')).status).toBe(429);
  });

  it('an email with no account answers exactly like a wrong code (no enumeration)', async () => {
    const u = await signUpUser(kit);
    const code = codeFrom(kit.mailer.lastTo(u.email)!.text);
    const wrong = await sendCode(u.email, otherCode(code));
    const nobody = await sendCode('nobody-here@example.com', code);
    expect(nobody.status).toBe(wrong.status);
    expect(stable(nobody.data)).toBe(stable(wrong.data));
    expect(nobody.res.headers.get('set-cookie')).toBeNull();
  });

  it('refuses anything that is not six digits before looking anything up', async () => {
    const u = await signUpUser(kit);
    for (const code of ['12345', '1234567', 'abcdef', '12 34 5']) {
      expect((await sendCode(u.email, code)).status).toBe(422);
    }
  });
});

describe('the confirmation email itself', () => {
  it('has the violet layout with the white logo, and the plain text carries the same code and link', async () => {
    const u = uniqueUser();
    await signUpUser(kit, u);
    const mail = kit.mailer.lastTo(u.email)!;
    expect(mail.html).toContain('#260959');
    expect(mail.html).toContain('/brand/howdy-wordmark-white.png');
    expect(mail.text).toContain(`@${u.handle}`);
    expect(mail.text).toContain('/verify?token=');
    expect(mail.html).toContain(codeFrom(mail.text).slice(0, 3));
    expect(mail.text).not.toContain(u.password);
  });
});
