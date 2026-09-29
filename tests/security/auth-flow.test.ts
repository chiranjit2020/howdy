import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { credentials, emailTokens, sessions } from '@db/schema';
import { authHandlers } from '@/modules/auth';
import { INVALID_CREDENTIALS_MESSAGE } from '@/modules/auth/accounts';
import { getPool } from '@/platform/db';
import { logger } from '@/platform/logger';
import {
  PASSWORD,
  auditEvents,
  call,
  cookieFrom,
  db,
  freshAuthState,
  loginAs,
  me,
  sessionRows,
  signUpUser,
  signedInUser,
  tokenFrom,
  tokenHashOf,
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

describe('sign up → verify → sign in → me → sign out (happy path)', () => {
  it('walks the whole journey', async () => {
    const u = uniqueUser('walker');
    const signup = await signUpUser(kit, u);
    expect(signup.response.status).toBe(202);
    expect(signup.response.data).toEqual({ ok: true });

    // account exists but is unverified; one verification mail was sent
    expect((await userByEmail(u.email))?.emailVerifiedAt).toBeNull();
    expect(kit.mailer.sent).toHaveLength(1);
    const mail = kit.mailer.lastTo(u.email)!;
    expect(mail.text).toContain('/verify?token=');
    expect(mail.text).not.toContain(u.password);

    // cannot sign in before confirming the email — and only after the password is proven right is that revealed
    const early = await loginAs(u);
    expect(early.status).toBe(403);
    expect(early.data.error?.code).toBe('EMAIL_NOT_VERIFIED');
    expect(early.cookie).toBeUndefined();

    const verify = await call(authHandlers.verifyEmail, 'POST', '/api/auth/verify-email', {
      token: tokenFrom(mail.text),
    });
    expect(verify.status).toBe(200);
    expect((await userByEmail(u.email))?.emailVerifiedAt).toBeInstanceOf(Date);

    const login = await loginAs(u);
    expect(login.status).toBe(200);
    expect(login.data).toEqual({ user: { id: expect.any(String), handle: u.handle } });
    expect(login.cookie).toMatch(/^howdy_session=[A-Za-z0-9_-]{43}$/);

    const who = await me(login.cookie);
    expect(who.status).toBe(200);
    expect(who.data).toEqual({
      user: { id: expect.any(String), email: u.email, handle: u.handle, emailVerified: true },
    });

    const out = await call(authHandlers.logout, 'POST', '/api/auth/logout', {}, { cookie: login.cookie! });
    expect(out.status).toBe(200);
    expect((await me(login.cookie)).status).toBe(401);
  });

  it('records the security-relevant events in the audit log (no IPs, no secrets)', async () => {
    const u = await signedInUser(kit);
    await loginAs({ email: u.email, password: 'definitely the wrong one' });
    const user = (await userByEmail(u.email))!;
    expect(await auditEvents(user.id)).toEqual(
      expect.arrayContaining(['signup', 'email_verified', 'login_success', 'login_failed']),
    );
    // The table has no ip / token / password columns at all — asserted by its exact column list:
    const cols = await getPool().query(
      "select column_name from information_schema.columns where table_name = 'audit_log'",
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual([
      'created_at',
      'event',
      'id',
      'meta',
      'request_id',
      'user_id',
    ]);
  });

  it('logs in with the handle as well as the email, and is case-insensitive', async () => {
    const u = await verifiedUser(kit, {
      email: 'Mixed.Case@Example.com'.toLowerCase(),
      handle: 'mixed_case',
      password: PASSWORD,
      acceptTerms: true,
    });
    const byHandle = await call(authHandlers.login, 'POST', '/api/auth/login', {
      identifier: 'MIXED_CASE',
      password: u.password,
    });
    expect(byHandle.status).toBe(200);
    const byEmail = await call(authHandlers.login, 'POST', '/api/auth/login', {
      identifier: 'MIXED.CASE@EXAMPLE.COM',
      password: u.password,
    });
    expect(byEmail.status).toBe(200);
  });
});

describe('what is stored at rest', () => {
  it('stores the password only as an Argon2id hash', async () => {
    const u = await verifiedUser(kit);
    const [row] = await db().select().from(credentials);
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row!.passwordHash).not.toContain(u.password);
  });

  it('stores session tokens only as SHA-256 digests — the cookie value exists nowhere in the database', async () => {
    const u = await signedInUser(kit);
    const token = u.cookie.split('=')[1]!;
    const [row] = await db().select().from(sessions);
    expect(row!.tokenHash).toHaveLength(32);
    expect(row!.tokenHash.equals(tokenHashOf(token))).toBe(true);
    const leak = await getPool().query(
      "select count(*)::int as n from sessions where encode(token_hash, 'escape') like $1 or device_label like $1",
      [`%${token}%`],
    );
    expect(leak.rows[0].n).toBe(0);
  });

  it('stores email tokens only as digests', async () => {
    const u = uniqueUser();
    await signUpUser(kit, u);
    const token = tokenFrom(kit.mailer.lastTo(u.email)!.text);
    const [row] = await db().select().from(emailTokens);
    expect(row!.tokenHash.equals(tokenHashOf(token))).toBe(true);
    expect(row!.tokenHash.toString('base64url')).not.toBe(token);
  });

  it('does not store the client IP or raw user agent on a session', async () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537 Edg/120 super-unique-build-1234';
    const u = uniqueUser();
    await verifiedUser(kit, u);
    await call(
      authHandlers.login,
      'POST',
      '/api/auth/login',
      { identifier: u.email, password: u.password },
      { ip: '198.51.100.7', headers: { 'user-agent': ua } },
    );
    const cols = await getPool().query(
      "select column_name from information_schema.columns where table_name = 'sessions'",
    );
    expect(cols.rows.map((r) => r.column_name)).not.toEqual(
      expect.arrayContaining(['ip', 'ip_address', 'user_agent']),
    );
    const [row] = await db().select().from(sessions);
    expect(row!.deviceLabel).toBe('Edge on Windows');
    expect(JSON.stringify(row)).not.toContain('super-unique-build');
    expect(JSON.stringify(row)).not.toContain('198.51.100.7');
  });
});

describe('responses and logs never carry secrets', () => {
  it('login response body contains no token, hash or password (the token only travels in Set-Cookie)', async () => {
    const u = uniqueUser();
    await verifiedUser(kit, u);
    const r = await call(authHandlers.login, 'POST', '/api/auth/login', {
      identifier: u.email,
      password: u.password,
    });
    const token = cookieFrom(r.res)!.split('=')[1]!;
    expect(r.text).not.toContain(token);
    expect(r.text).not.toContain(u.password);
    expect(r.text).not.toMatch(/argon2|hash/i);
  });

  it('failed logins and validation errors do not put the submitted password in the logs', async () => {
    const spies = (['info', 'warn', 'error'] as const).map((l) => vi.spyOn(logger, l));
    const u = uniqueUser();
    await verifiedUser(kit, u);
    const secret = 'Tr0ub4dor-and-friends-9000';
    await loginAs({ email: u.email, password: secret });
    await call(authHandlers.signup, 'POST', '/api/auth/signup', {
      email: 'bad',
      handle: 'x',
      password: secret,
    });
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(secret);
    spies.forEach((s) => s.mockRestore());
  });

  it('a wrong password uses the exact generic message and the 401 status', async () => {
    const u = await verifiedUser(kit);
    const r = await loginAs({ email: u.email, password: 'not the right password' });
    expect(r.status).toBe(401);
    expect(r.data.error).toMatchObject({ code: 'UNAUTHENTICATED', message: INVALID_CREDENTIALS_MESSAGE });
  });
});

describe('sign-up validation is enforced on the server', () => {
  it.each([
    ['weak password', { password: 'short' }, 'password'],
    ['common password', { password: 'Password123' }, 'password'],
    [
      'password built from the email',
      { email: 'chiranjit@example.com', password: 'chiranjit-forever!' },
      'password',
    ],
    ['invalid email', { email: 'nope' }, 'email'],
    ['reserved handle', { handle: 'admin' }, 'handle'],
    // Fixed words under /whispers/… (a call sign there would share its URL with the page): ADR-026.
    ['reserved handle: held', { handle: 'held' }, 'handle'],
    ['reserved handle: unread', { handle: 'unread' }, 'handle'],
    ['bad handle characters', { handle: 'a b!' }, 'handle'],
  ])('%s → 422 on the right field, and nothing is created', async (_n, patch, field) => {
    const r = await call(authHandlers.signup, 'POST', '/api/auth/signup', { ...uniqueUser(), ...patch });
    expect(r.status).toBe(422);
    expect(Object.keys(r.data.error?.fields ?? {})).toContain(field);
    expect(
      await getPool()
        .query('select count(*)::int as n from users')
        .then((x) => x.rows[0].n),
    ).toBe(0);
  });

  it('reports a taken handle (handles are public) and creates nothing', async () => {
    const first = await verifiedUser(kit);
    const r = await call(authHandlers.signup, 'POST', '/api/auth/signup', {
      ...uniqueUser(),
      handle: first.handle.toUpperCase(),
    });
    expect(r.status).toBe(409);
    expect(r.data.error?.fields).toEqual({ handle: 'That call sign is taken.' });
  });

  it('DB constraints back the app rules (a bad row cannot be inserted even by buggy code)', async () => {
    const pool = getPool();
    await expect(
      pool.query("insert into users (email, handle) values ('a@b.co', 'Has Caps')"),
    ).rejects.toThrow(/users_handle_format/);
    await expect(
      pool.query("insert into users (email, handle, status) values ('a@b.co', 'okhandle', 'weird')"),
    ).rejects.toThrow(/users_status_check/);
    await expect(
      pool.query("insert into users (email, handle) values ('no-at-sign', 'okhandle2')"),
    ).rejects.toThrow(/users_email_shape/);
  });
});

describe('account status', () => {
  it('a suspended account cannot sign in, and its existing session stops working immediately', async () => {
    const u = await signedInUser(kit);
    expect((await me(u.cookie)).status).toBe(200);
    await getPool().query("update users set status = 'suspended' where email = $1", [u.email]);
    expect((await me(u.cookie)).status).toBe(401);
    const r = await loginAs(u);
    expect(r.status).toBe(403);
    // Only after the password is proven, a suspended person is told so (ADR-023; details in suspensions.test.ts).
    expect(r.data.error?.code).toBe('ACCOUNT_SUSPENDED');
    expect(r.cookie).toBeUndefined();
  });

  it('a suspended account gets no password-reset email', async () => {
    const u = await verifiedUser(kit);
    await getPool().query("update users set status = 'suspended' where email = $1", [u.email]);
    kit.mailer.sent.length = 0;
    await call(authHandlers.forgotPassword, 'POST', '/api/auth/forgot-password', { email: u.email });
    const { flushBackground } = await import('@/platform/background');
    await flushBackground();
    expect(kit.mailer.sent).toHaveLength(0);
  });
});

describe('sessions belong to their owner', () => {
  it('each login creates its own session, listed with a coarse device label', async () => {
    const u = uniqueUser();
    await verifiedUser(kit, u);
    await loginAs(u, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/1 Safari/1 Edg/1' } });
    const second = await loginAs(u, {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/17 Safari/605' },
    });
    const list = await call(authHandlers.listSessions, 'GET', '/api/auth/sessions', undefined, {
      cookie: second.cookie!,
    });
    const labels = (list.data.sessions as { deviceLabel: string; current: boolean }[])
      .map((s) => s.deviceLabel)
      .sort();
    expect(labels).toEqual(['Edge on Windows', 'Safari on macOS']);
    expect((list.data.sessions as { current: boolean }[]).filter((s) => s.current)).toHaveLength(1);
    expect(list.text).not.toMatch(/token|hash/i);
    expect((await sessionRows((await userByEmail(u.email))!.id)).length).toBe(2);
  });
});
