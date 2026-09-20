import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authHandlers } from '@/modules/auth';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '@/modules/auth/config';
import { getPool } from '@/platform/db';
import {
  call,
  cookieFrom,
  freshAuthState,
  loginAs,
  me,
  request,
  sessionRows,
  signedInUser,
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

const pool = () => getPool();
const sql = (q: string, args: unknown[] = []) => pool().query(q, args);

describe('session lifetime is enforced on the server', () => {
  it('idle expiry: a session unused past its idle window is dead', async () => {
    const u = await signedInUser(kit);
    expect((await me(u.cookie)).status).toBe(200);
    await sql("update sessions set idle_expires_at = now() - interval '1 second'");
    expect((await me(u.cookie)).status).toBe(401);
  });

  it('absolute expiry: an old session dies even if it was used recently', async () => {
    const u = await signedInUser(kit);
    await sql(
      "update sessions set absolute_expires_at = now() - interval '1 second', idle_expires_at = now() + interval '10 days'",
    );
    expect((await me(u.cookie)).status).toBe(401);
  });

  it('activity slides the idle window forward, but never past the absolute limit', async () => {
    const u = await signedInUser(kit);
    // pretend it was last seen 10 minutes ago with a short remaining idle window
    await sql(
      "update sessions set last_seen_at = now() - interval '10 minutes', idle_expires_at = now() + interval '1 day'",
    );
    expect((await me(u.cookie)).status).toBe(200);
    const [s] = await sessionRows((await userByEmail(u.email))!.id);
    const idleLeft = s!.idleExpiresAt.getTime() - Date.now();
    expect(idleLeft).toBeGreaterThan(SESSION_IDLE_MS - 60_000);

    // now cap: absolute limit is 1 day away, so idle cannot exceed it
    await sql(
      "update sessions set last_seen_at = now() - interval '10 minutes', absolute_expires_at = now() + interval '1 day'",
    );
    expect((await me(u.cookie)).status).toBe(200);
    const [c] = await sessionRows((await userByEmail(u.email))!.id);
    expect(c!.idleExpiresAt.getTime()).toBeLessThanOrEqual(c!.absoluteExpiresAt.getTime());
  });

  it('a fresh session gets the documented limits (14 day idle, 60 day absolute)', async () => {
    const u = await signedInUser(kit);
    const [s] = await sessionRows((await userByEmail(u.email))!.id);
    expect(Math.abs(s!.idleExpiresAt.getTime() - s!.createdAt.getTime() - SESSION_IDLE_MS)).toBeLessThan(
      5_000,
    );
    expect(
      Math.abs(s!.absoluteExpiresAt.getTime() - s!.createdAt.getTime() - SESSION_ABSOLUTE_MS),
    ).toBeLessThan(5_000);
  });

  it('a revoked session is dead even though its cookie is otherwise valid', async () => {
    const u = await signedInUser(kit);
    await sql('update sessions set revoked_at = now()');
    expect((await me(u.cookie)).status).toBe(401);
  });

  it.each([
    ['empty', ''],
    ['garbage', 'howdy_session=not-a-real-token'],
    ['right length, unknown value', `howdy_session=${'A'.repeat(43)}`],
    ['sql-ish', "howdy_session=' OR 1=1 --"],
    ['wrong cookie name', `other=${'A'.repeat(43)}`],
  ])('an invalid cookie (%s) is simply unauthenticated', async (_n, cookie) => {
    const r = await me(cookie || undefined);
    expect(r.status).toBe(401);
    expect(r.data.error?.code).toBe('UNAUTHENTICATED');
  });
});

describe('session fixation', () => {
  it('signing in revokes the session that was presented and issues a brand-new token', async () => {
    const victim = uniqueUser();
    await verifiedUser(kit, victim);
    const planted = await loginAs(victim); // stands in for a cookie an attacker planted / a leftover cookie
    const second = await call(
      authHandlers.login,
      'POST',
      '/api/auth/login',
      { identifier: victim.email, password: victim.password },
      { cookie: planted.cookie! },
    );
    const fresh = cookieFrom(second.res)!;
    expect(fresh).not.toBe(planted.cookie);
    expect((await me(planted.cookie)).status).toBe(401); // the presented one is dead
    expect((await me(fresh)).status).toBe(200);
  });

  it('a failed sign-in does not touch the presented session', async () => {
    const u = await signedInUser(kit);
    const bad = await call(
      authHandlers.login,
      'POST',
      '/api/auth/login',
      { identifier: u.email, password: 'wrong wrong wrong' },
      { cookie: u.cookie },
    );
    expect(bad.status).toBe(401);
    expect((await me(u.cookie)).status).toBe(200);
  });
});

describe('sign out', () => {
  it('logout kills only this session and clears the cookie; a second logout is harmless', async () => {
    const u = uniqueUser();
    await verifiedUser(kit, u);
    const a = await loginAs(u);
    const b = await loginAs(u);
    const out = await call(authHandlers.logout, 'POST', '/api/auth/logout', {}, { cookie: a.cookie! });
    expect(out.status).toBe(200);
    expect(out.res.headers.getSetCookie().join(';')).toMatch(/howdy_session=;.*Max-Age=0/);
    expect((await me(a.cookie)).status).toBe(401);
    expect((await me(b.cookie)).status).toBe(200);
    expect(
      (await call(authHandlers.logout, 'POST', '/api/auth/logout', {}, { cookie: a.cookie! })).status,
    ).toBe(200);
    expect((await call(authHandlers.logout, 'POST', '/api/auth/logout', {})).status).toBe(200);
  });

  it('logout-all kills every session of this user and nobody else’s', async () => {
    const u = uniqueUser();
    await verifiedUser(kit, u);
    const a = await loginAs(u);
    const b = await loginAs(u);
    const other = await signedInUser(kit);
    const out = await call(authHandlers.logoutAll, 'POST', '/api/auth/logout-all', {}, { cookie: a.cookie! });
    expect(out.status).toBe(200);
    expect((await me(a.cookie)).status).toBe(401);
    expect((await me(b.cookie)).status).toBe(401);
    expect((await me(other.cookie)).status).toBe(200);
  });
});

describe('object-level authorisation on sessions (User A vs User B)', () => {
  it('A cannot revoke B’s session: same 404 as a session that does not exist, and B stays signed in', async () => {
    const a = await signedInUser(kit);
    const b = await signedInUser(kit);
    const [bSession] = await sessionRows((await userByEmail(b.email))!.id);

    const attack = await authHandlers.revokeSession(
      request('DELETE', `/api/auth/sessions/${bSession!.id}`, undefined, { cookie: a.cookie }),
      {
        params: Promise.resolve({ id: bSession!.id }),
      },
    );
    const phantomId = '00000000-0000-4000-8000-000000000000';
    const phantom = await authHandlers.revokeSession(
      request('DELETE', `/api/auth/sessions/${phantomId}`, undefined, { cookie: a.cookie }),
      {
        params: Promise.resolve({ id: phantomId }),
      },
    );
    expect(attack.status).toBe(404);
    expect(phantom.status).toBe(404);
    const strip = async (r: Response) =>
      JSON.stringify(JSON.parse(await r.text()), (k, v) => (k === 'requestId' ? undefined : v));
    expect(await strip(attack)).toBe(await strip(phantom));
    expect((await me(b.cookie)).status).toBe(200);
  });

  it('A can revoke their own other session, and revoking the current one also clears the cookie', async () => {
    const u = uniqueUser();
    await verifiedUser(kit, u);
    const first = await loginAs(u);
    const second = await loginAs(u);
    const rows = await sessionRows((await userByEmail(u.email))!.id);
    const firstId = rows[rows.length - 1]!.id;
    const secondId = rows[0]!.id;

    const other = await authHandlers.revokeSession(
      request('DELETE', `/api/auth/sessions/${firstId}`, undefined, { cookie: second.cookie }),
      {
        params: Promise.resolve({ id: firstId }),
      },
    );
    expect(other.status).toBe(200);
    expect((await me(first.cookie)).status).toBe(401);
    expect((await me(second.cookie)).status).toBe(200);

    const self = await authHandlers.revokeSession(
      request('DELETE', `/api/auth/sessions/${secondId}`, undefined, { cookie: second.cookie }),
      {
        params: Promise.resolve({ id: secondId }),
      },
    );
    expect(self.status).toBe(200);
    expect(self.headers.getSetCookie().join(';')).toContain('Max-Age=0');
    expect((await me(second.cookie)).status).toBe(401);
  });

  it('the session list only ever contains my own sessions', async () => {
    const a = await signedInUser(kit);
    await signedInUser(kit);
    const list = await call(authHandlers.listSessions, 'GET', '/api/auth/sessions', undefined, {
      cookie: a.cookie,
    });
    expect(list.data.sessions as unknown[]).toHaveLength(1);
  });

  it('a malformed session id is a 404, not a database error', async () => {
    const a = await signedInUser(kit);
    for (const id of ['not-a-uuid', "1' OR '1'='1", '../../etc/passwd', '']) {
      const r = await authHandlers.revokeSession(
        request('DELETE', '/api/auth/sessions/x', undefined, { cookie: a.cookie }),
        { params: Promise.resolve({ id }) },
      );
      expect(r.status).toBe(404);
    }
  });
});

describe('unauthenticated access to protected endpoints', () => {
  it.each([
    ['me', authHandlers.me, 'GET', '/api/auth/me'],
    ['sessions', authHandlers.listSessions, 'GET', '/api/auth/sessions'],
    ['logout-all', authHandlers.logoutAll, 'POST', '/api/auth/logout-all'],
  ] as const)('%s → 401 with a generic message', async (_n, handler, method, path) => {
    const r = await call(handler, method, path, method === 'POST' ? {} : undefined);
    expect(r.status).toBe(401);
    expect(r.data.error?.code).toBe('UNAUTHENTICATED');
    expect(r.text).not.toMatch(/sql|select|stack|at .*\(/i);
  });

  it('revoking a session without signing in is 401', async () => {
    const r = await authHandlers.revokeSession(request('DELETE', '/api/auth/sessions/x'), {
      params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }),
    });
    expect(r.status).toBe(401);
  });
});
