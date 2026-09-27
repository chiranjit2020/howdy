import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authHandlers } from '@/modules/auth';
import { RATE } from '@/modules/auth/config';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import {
  PASSWORD,
  call,
  freshAuthState,
  loginAs,
  me,
  signedInUser,
  uniqueUser,
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

const badLogin = (identifier: string, opts: { ip?: string } = {}) =>
  call(authHandlers.login, 'POST', '/api/auth/login', { identifier, password: 'wrong wrong wrong' }, opts);

describe('brute-force protection', () => {
  it('after too many failed attempts on one account, even the RIGHT password is throttled', async () => {
    const u = await verifiedUser(kit);
    for (let i = 0; i < RATE.loginIdentifier.limit; i++) {
      expect((await badLogin(u.email, { ip: `10.0.0.${i + 1}` })).status).toBe(401);
    }
    const blocked = await badLogin(u.email, { ip: '10.0.1.1' });
    expect(blocked.status).toBe(429);
    expect(blocked.res.headers.get('retry-after')).toMatch(/^\d+$/);
    const rightPassword = await loginAs(u, { ip: '10.0.1.2' });
    expect(rightPassword.status).toBe(429);
    expect(rightPassword.cookie).toBeUndefined();
  });

  it('one address hammering many different accounts is throttled too', async () => {
    for (let i = 0; i < RATE.loginIp.limit; i++)
      expect((await badLogin(`victim${i}@example.com`, { ip: '203.0.113.50' })).status).toBe(401);
    expect((await badLogin('victim-final@example.com', { ip: '203.0.113.50' })).status).toBe(429);
    // …but a different address is unaffected
    expect((await badLogin('victim-final@example.com', { ip: '203.0.113.51' })).status).toBe(401);
  });

  it('the throttle response carries no information about the account', async () => {
    const real = await verifiedUser(kit);
    for (let i = 0; i < RATE.loginIdentifier.limit; i++)
      await badLogin(real.email, { ip: `10.1.0.${i + 1}` });
    for (let i = 0; i < RATE.loginIdentifier.limit; i++)
      await badLogin('ghost@example.com', { ip: `10.2.0.${i + 1}` });
    const a = await badLogin(real.email, { ip: '10.3.0.1' });
    const b = await badLogin('ghost@example.com', { ip: '10.3.0.2' });
    expect(a.status).toBe(429);
    expect(b.status).toBe(429);
    expect(JSON.stringify(a.data.error?.code)).toBe(JSON.stringify(b.data.error?.code));
  });

  it('address spoofing does not help: only the trusted-proxy hop is used, so a forged leftmost entry changes nothing', async () => {
    for (let i = 0; i < RATE.loginIp.limit; i++) {
      await call(
        authHandlers.login,
        'POST',
        '/api/auth/login',
        { identifier: `s${i}@example.com`, password: 'wrong wrong wrong' },
        { headers: { 'x-forwarded-for': `1.1.1.${i}, 198.51.100.9` } },
      );
    }
    const r = await call(
      authHandlers.login,
      'POST',
      '/api/auth/login',
      { identifier: 'again@example.com', password: 'wrong wrong wrong' },
      { headers: { 'x-forwarded-for': '9.9.9.9, 198.51.100.9' } },
    );
    expect(r.status).toBe(429);
  });

  it('sign-up, forgot-password and resend are rate limited per email', async () => {
    const email = 'flood@example.com';
    for (let i = 0; i < RATE.signupEmail.limit; i++) {
      expect(
        (
          await call(
            authHandlers.signup,
            'POST',
            '/api/auth/signup',
            { email, handle: `flood${i}`, password: PASSWORD, acceptTerms: true },
            { ip: `10.4.0.${i}` },
          )
        ).status,
      ).toBe(202);
    }
    expect(
      (
        await call(
          authHandlers.signup,
          'POST',
          '/api/auth/signup',
          { email, handle: 'flood_last', password: PASSWORD, acceptTerms: true },
          { ip: '10.4.9.9' },
        )
      ).status,
    ).toBe(429);

    for (const [handler, path, lim] of [
      [authHandlers.forgotPassword, '/api/auth/forgot-password', RATE.forgotEmail.limit],
      [authHandlers.resendVerification, '/api/auth/resend-verification', RATE.resendEmail.limit],
    ] as const) {
      for (let i = 0; i < lim; i++)
        expect(
          (await call(handler, 'POST', path, { email: 'target@example.com' }, { ip: `10.5.${i}.1` })).status,
        ).toBe(202);
      expect(
        (await call(handler, 'POST', path, { email: 'target@example.com' }, { ip: '10.5.9.9' })).status,
      ).toBe(429);
    }
    await flushBackground();
  });

  it('sign-up is rate limited per address', async () => {
    for (let i = 0; i < RATE.signupIp.limit; i++) {
      expect(
        (
          await call(
            authHandlers.signup,
            'POST',
            '/api/auth/signup',
            { email: `ip${i}@example.com`, handle: `ipuser${i}`, password: PASSWORD, acceptTerms: true },
            { ip: '192.0.2.77' },
          )
        ).status,
      ).toBe(202);
    }
    expect(
      (
        await call(
          authHandlers.signup,
          'POST',
          '/api/auth/signup',
          { email: 'ipx@example.com', handle: 'ipuserx', password: PASSWORD, acceptTerms: true },
          { ip: '192.0.2.77' },
        )
      ).status,
    ).toBe(429);
    await flushBackground();
  });

  it('fails CLOSED: if the limiter backend is down, sign-in is refused, not waved through', async () => {
    const u = await verifiedUser(kit);
    setRateLimiter({ consume: async () => Promise.reject(new Error('redis down')) });
    const r = await loginAs(u);
    expect(r.status).toBe(500);
    expect(r.cookie).toBeUndefined();
    expect(r.text).not.toContain('redis');
  });
});

describe('CSRF: cross-site requests are rejected before any effect', () => {
  const evil = { origin: 'https://evil.example' };

  it('a forged sign-in with valid credentials creates no session', async () => {
    const u = await verifiedUser(kit);
    const r = await call(
      authHandlers.login,
      'POST',
      '/api/auth/login',
      { identifier: u.email, password: u.password },
      evil,
    );
    expect(r.status).toBe(403);
    expect(r.res.headers.get('set-cookie')).toBeNull();
    expect((await getPool().query('select count(*)::int as n from sessions')).rows[0].n).toBe(0);
  });

  it('a forged logout-all does not sign anyone out', async () => {
    const u = await signedInUser(kit);
    const r = await call(
      authHandlers.logoutAll,
      'POST',
      '/api/auth/logout-all',
      {},
      { ...evil, cookie: u.cookie },
    );
    expect(r.status).toBe(403);
    expect((await me(u.cookie)).status).toBe(200);
  });

  it('a forged sign-up, reset or logout does nothing', async () => {
    const before = (await getPool().query('select count(*)::int as n from users')).rows[0].n;
    expect((await call(authHandlers.signup, 'POST', '/api/auth/signup', uniqueUser(), evil)).status).toBe(
      403,
    );
    expect(
      (
        await call(
          authHandlers.resetPassword,
          'POST',
          '/api/auth/reset-password',
          { token: 'A'.repeat(43), password: PASSWORD },
          evil,
        )
      ).status,
    ).toBe(403);
    const u = await signedInUser(kit);
    expect(
      (await call(authHandlers.logout, 'POST', '/api/auth/logout', {}, { ...evil, cookie: u.cookie })).status,
    ).toBe(403);
    expect((await me(u.cookie)).status).toBe(200);
    expect((await getPool().query('select count(*)::int as n from users')).rows[0].n).toBe(before + 1); // only the legit user above
  });

  it('a request with no Origin and no Fetch-Metadata is refused; same-origin Fetch-Metadata is accepted', async () => {
    const u = await verifiedUser(kit);
    const body = { identifier: u.email, password: u.password };
    expect((await call(authHandlers.login, 'POST', '/api/auth/login', body, { origin: null })).status).toBe(
      403,
    );
    expect(
      (
        await call(authHandlers.login, 'POST', '/api/auth/login', body, {
          origin: null,
          headers: { 'sec-fetch-site': 'cross-site' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(authHandlers.login, 'POST', '/api/auth/login', body, {
          origin: null,
          headers: { 'sec-fetch-site': 'same-origin' },
        })
      ).status,
    ).toBe(200);
  });
});

describe('hostile input', () => {
  it.each([
    ['wrong content type', { contentType: 'text/plain' }],
    ['no content type', { contentType: null }],
    ['invalid JSON', { rawBody: '{oops' }],
    ['array instead of object', { rawBody: '[1,2,3]' }],
    ['oversized body', { rawBody: JSON.stringify({ identifier: 'a', password: 'x'.repeat(20_000) }) }],
  ])('login rejects %s with a 400 and no side effects', async (_n, opts) => {
    const r = await call(authHandlers.login, 'POST', '/api/auth/login', {}, opts);
    expect(r.status).toBe(400);
    expect(r.text).not.toMatch(/stack|sql|at .*\(/i);
  });

  it('SQL and script payloads in every field are just text: nothing executes, nothing leaks', async () => {
    const payload = "'; DROP TABLE users; --";
    for (const identifier of [payload, '<script>alert(1)</script>', 'admin\u0000', '%00']) {
      const r = await call(authHandlers.login, 'POST', '/api/auth/login', { identifier, password: payload });
      expect([401, 422]).toContain(r.status);
      expect(r.text).not.toMatch(/syntax|relation|postgres|stack/i);
    }
    const s = await call(authHandlers.signup, 'POST', '/api/auth/signup', {
      email: `${payload}@example.com`,
      handle: payload,
      password: PASSWORD,
    });
    expect(s.status).toBe(422);
    expect((await getPool().query("select to_regclass('public.users') as t")).rows[0].t).toBe('users');
  });

  it('extra unexpected fields cannot set privileged columns (mass assignment)', async () => {
    const u = uniqueUser();
    const r = await call(authHandlers.signup, 'POST', '/api/auth/signup', {
      ...u,
      status: 'suspended',
      emailVerifiedAt: '2020-01-01',
      id: '00000000-0000-4000-8000-000000000001',
      role: 'admin',
    });
    await flushBackground();
    expect(r.status).toBe(202);
    const row = (
      await getPool().query('select id, status, email_verified_at from users where email = $1', [u.email])
    ).rows[0];
    expect(row.status).toBe('active');
    expect(row.email_verified_at).toBeNull();
    expect(row.id).not.toBe('00000000-0000-4000-8000-000000000001');
  });

  it('every error carries a request id and never a stack trace', async () => {
    const r = await call(authHandlers.login, 'POST', '/api/auth/login', { identifier: '', password: '' });
    expect(r.status).toBe(422);
    expect(r.data.error?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.res.headers.get('x-request-id')).toBe(r.data.error?.requestId);
    expect(r.res.headers.get('cache-control')).toBe('no-store');
  });
});
