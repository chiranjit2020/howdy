import { credentials } from '@db/schema';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authHandlers } from '@/modules/auth';
import { NO_PASSWORD_MESSAGE } from '@/modules/auth/no-password';
import { resetEnvCache } from '@/platform/config/env';
import { getPool } from '@/platform/db';
import {
  call,
  cookieFrom,
  db,
  freshAuthState,
  loginAs,
  me,
  signUpUser,
  uniqueUser,
  userByEmail,
  verifiedUser,
  type TestKit,
} from '../helpers/auth';

/** ADR-048: "Continue with Google" — the flow's checks, the hand-off to normal sign-in, and the account rules. */

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const env = process.env as Record<string, string | undefined>;

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
  env.GOOGLE_CLIENT_ID = CLIENT_ID;
  env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  resetEnvCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  delete env.GOOGLE_CLIENT_ID;
  delete env.GOOGLE_CLIENT_SECRET;
  resetEnvCache();
  await getPool().end();
});

const pairs = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]!);
const named = (res: Response, part: string) => pairs(res).find((p) => p.includes(part) && !p.endsWith('='));

async function start(query = 'remember=1') {
  const r = await call(authHandlers.googleStart, 'GET', `/api/auth/google/start?${query}`);
  const location = new URL(r.res.headers.get('location')!);
  return { r, location, flow: named(r.res, 'google-flow')! };
}

/** Google's token endpoint, answering with an ID token whose claims we choose. */
function googleAnswers(claims: Record<string, unknown>, status = 200) {
  const seg = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  vi.stubGlobal('fetch', async (url: string | URL | Request) => {
    expect(String(url)).toBe('https://oauth2.googleapis.com/token');
    return Response.json({ id_token: `${seg({ alg: 'RS256' })}.${seg(claims)}.sig` }, { status });
  });
}

/** Run the whole round trip: start, Google says `claims` (nonce filled in), callback. */
async function roundTrip(claims: Record<string, unknown>, opts: { state?: string; cookie?: string } = {}) {
  const s = await start();
  googleAnswers({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce: s.location.searchParams.get('nonce'),
    email_verified: true,
    // The test addresses are @example.com: Google answers as if that were a Workspace domain it controls, unless a
    // test says otherwise (`hd: undefined`).
    hd: 'example.com',
    ...claims,
  });
  const state = opts.state ?? s.location.searchParams.get('state')!;
  const cb = await call(
    authHandlers.googleCallback,
    'GET',
    `/api/auth/google/callback?code=c0de&state=${encodeURIComponent(state)}`,
    undefined,
    { cookie: opts.cookie ?? s.flow },
  );
  return { cb, to: cb.res.headers.get('location') ?? '' };
}

describe('starting', () => {
  it('sends the browser to Google with state, nonce and a PKCE challenge, remembered in a short HttpOnly cookie', async () => {
    const { r, location } = await start();
    expect(r.res.status).toBe(303);
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('state')).toMatch(/^[\w-]{43}$/);
    expect(location.searchParams.get('nonce')).toMatch(/^[\w-]{43}$/);
    const raw = r.res.headers.getSetCookie().find((c) => c.includes('google-flow'))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
  });

  it('does nothing when Google is not set up', async () => {
    delete env.GOOGLE_CLIENT_ID;
    delete env.GOOGLE_CLIENT_SECRET;
    resetEnvCache();
    const r = await call(authHandlers.googleStart, 'GET', '/api/auth/google/start');
    expect(new URL(r.res.headers.get('location')!).pathname).toBe('/login');
  });
});

describe('Google’s answer is checked', () => {
  it.each([
    ['a different state', { state: 'x'.repeat(43) }, {}],
    ['no flow cookie', { cookie: 'unrelated=1' }, {}],
    ['another app’s token', {}, { aud: 'someone-else.apps.googleusercontent.com' }],
    ['a foreign issuer', {}, { iss: 'https://evil.example' }],
    ['an expired token', {}, { exp: Math.floor(Date.now() / 1000) - 10 }],
    ['a replayed nonce', {}, { nonce: 'n'.repeat(43) }],
    ['an email Google has not verified', {}, { email_verified: false }],
  ])('refuses %s, and signs nobody in', async (_n, opts, claims) => {
    const email = `${uniqueUser('g').handle}@example.com`;
    const { cb, to } = await roundTrip({ email, ...claims }, opts);
    expect(to).toMatch(/\/login\?google=failed$/);
    expect(named(cb.res, 'session')).toBeUndefined();
    expect(named(cb.res, 'google-proven')).toBeUndefined();
    expect(named(cb.res, 'google-signup')).toBeUndefined();
    expect(await userByEmail(email)).toBeUndefined();
  });

  it.each([
    ['no Workspace domain', { hd: undefined }],
    ['a Workspace domain that is not the address’s own', { hd: 'other.example' }],
  ])(
    'refuses an address Google does not control (%s), and changes nothing about an existing account',
    async (_n, claims) => {
      // An account that never confirmed its email: a Google answer for it must not strip its password.
      const u = uniqueUser('stale');
      await signUpUser(kit, u);
      const { cb, to } = await roundTrip({ email: u.email, ...claims });
      expect(to).toMatch(/\/login\?google=use-email$/);
      expect(named(cb.res, 'google-proven')).toBeUndefined();
      expect(named(cb.res, 'google-signup')).toBeUndefined();
      const row = await userByEmail(u.email);
      expect(row?.emailVerifiedAt).toBeNull();
      expect(await db().select().from(credentials).where(eq(credentials.userId, row!.id))).toHaveLength(1);
    },
  );

  it('refuses someone new with such an address too (no account under an address they may no longer own)', async () => {
    const email = `${uniqueUser('newstale').handle}@example.com`;
    const { cb, to } = await roundTrip({ email, hd: undefined });
    expect(to).toMatch(/\/login\?google=use-email$/);
    expect(named(cb.res, 'google-signup')).toBeUndefined();
    expect(await userByEmail(email)).toBeUndefined();
  });

  it('a cancelled consent screen just goes back to Log in', async () => {
    const s = await start();
    const cb = await call(
      authHandlers.googleCallback,
      'GET',
      '/api/auth/google/callback?error=access_denied',
      undefined,
      {
        cookie: s.flow,
      },
    );
    expect(cb.res.headers.get('location')).toMatch(/\/login\?google=cancelled$/);
  });
});

describe('someone new', () => {
  it('picks a username, and is in: email verified, no password, no confirmation mail', async () => {
    const u = uniqueUser('newg');
    const email = `${u.handle}@gmail.com`;
    const { cb, to } = await roundTrip({ email, name: 'Rick Sen' });
    expect(new URL(to).pathname).toBe('/signup/google');
    const pending = named(cb.res, 'google-signup')!;

    // The cookie is the only proof: without it, nothing is created.
    const without = await call(authHandlers.googleComplete, 'POST', '/api/auth/google/complete', {
      handle: u.handle,
      acceptTerms: true,
    });
    expect(without.res.status).toBe(401);

    // The Terms box is still required.
    const noTerms = await call(
      authHandlers.googleComplete,
      'POST',
      '/api/auth/google/complete',
      { handle: u.handle },
      {
        cookie: pending,
      },
    );
    expect(noTerms.res.status).toBe(422);

    const done = await call(
      authHandlers.googleComplete,
      'POST',
      '/api/auth/google/complete',
      { handle: u.handle, displayName: 'Rick Sen', acceptTerms: true },
      { cookie: pending },
    );
    expect(done.res.status).toBe(200);
    const session = cookieFrom(done.res)!;
    expect((await me(session)).status).toBe(200);
    const row = await userByEmail(email);
    expect(row?.emailVerifiedAt).toBeTruthy();
    expect(await db().select().from(credentials).where(eq(credentials.userId, row!.id))).toHaveLength(0);
    expect(kit.mailer.sent.filter((m) => m.to === email)).toHaveLength(0);

    // No password yet: closing the account says how to set one, instead of "wrong password".
    const close = await call(
      authHandlers.deleteAccount,
      'POST',
      '/api/me/delete-account',
      { password: 'anything-at-all' },
      {
        cookie: session,
      },
    );
    expect(close.data.error?.message).toBe(NO_PASSWORD_MESSAGE);
  });
});

describe('an existing account', () => {
  it('Google proves it, and normal sign-in finishes it (the proof is a cookie, never the request body)', async () => {
    const u = await verifiedUser(kit);
    const { cb, to } = await roundTrip({ email: u.email.toUpperCase() });
    expect(to).toMatch(/\/login\?google=continue$/);
    const proven = named(cb.res, 'google-proven')!;

    const noCookie = await call(authHandlers.login, 'POST', '/api/auth/login', { google: true });
    expect(noCookie.res.status).toBe(401);
    // An id in the body is not a proof.
    const forged = await call(authHandlers.login, 'POST', '/api/auth/login', {
      google: true,
      googleUserId: (await userByEmail(u.email))!.id,
    });
    expect(forged.res.status).toBe(422);

    const ok = await call(
      authHandlers.login,
      'POST',
      '/api/auth/login',
      { google: true },
      { cookie: proven },
    );
    expect(ok.res.status).toBe(200);
    expect((await me(cookieFrom(ok.res))).status).toBe(200);
    // The password still works too.
    expect((await loginAs(u)).cookie).toBeTruthy();
  });

  it('an account nobody confirmed loses the password whoever made it set ("pre-hijack"), and is the Google owner’s', async () => {
    const victim = uniqueUser('victim');
    await signUpUser(kit, victim); // someone registered this email with their own password, never confirmed it
    const { cb } = await roundTrip({ email: victim.email });
    const row = await userByEmail(victim.email);
    expect(row?.emailVerifiedAt).toBeTruthy();
    expect(await db().select().from(credentials).where(eq(credentials.userId, row!.id))).toHaveLength(0);
    // The password set before Google confirmed the address is useless now.
    const old = await call(authHandlers.login, 'POST', '/api/auth/login', {
      identifier: victim.email,
      password: victim.password,
    });
    expect(old.res.status).toBe(401);
    const ok = await call(
      authHandlers.login,
      'POST',
      '/api/auth/login',
      { google: true },
      {
        cookie: named(cb.res, 'google-proven')!,
      },
    );
    expect(ok.res.status).toBe(200);
  });
});

describe('confirm it’s you with Google (no password: download data, close account, sign-in security)', () => {
  /** Someone who joined with Google and is signed in: their email and session cookie. */
  async function googleOnlyPerson() {
    const u = uniqueUser('gconf');
    const email = `${u.handle}@gmail.com`;
    const { cb } = await roundTrip({ email, name: 'G Person' });
    const done = await call(
      authHandlers.googleComplete,
      'POST',
      '/api/auth/google/complete',
      { handle: u.handle, acceptTerms: true },
      { cookie: named(cb.res, 'google-signup')! },
    );
    return { email, session: cookieFrom(done.res)! };
  }

  /** Start confirming on `session`, Google answers with `claims`, callback on the same session. */
  async function confirm(
    session: string,
    claims: Record<string, unknown>,
    next = '/settings/account#delete',
  ) {
    const s = await call(
      authHandlers.googleConfirmStart,
      'GET',
      `/api/auth/google/confirm?next=${encodeURIComponent(next)}`,
      undefined,
      { cookie: session },
    );
    const location = new URL(s.res.headers.get('location')!);
    const flow = named(s.res, 'google-flow')!;
    googleAnswers({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce: location.searchParams.get('nonce'),
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000),
      ...claims,
    });
    const cb = await call(
      authHandlers.googleCallback,
      'GET',
      `/api/auth/google/callback?code=c0de&state=${encodeURIComponent(location.searchParams.get('state')!)}`,
      undefined,
      { cookie: `${session}; ${flow}` },
    );
    return { location, to: cb.res.headers.get('location') ?? '', proof: named(cb.res, 'google-confirmed') };
  }

  it('Google is made to ask again, for this address; the proof lets this session download and close the account', async () => {
    const p = await googleOnlyPerson();
    const { location, to, proof } = await confirm(p.session, { email: p.email });
    expect(location.searchParams.get('prompt')).toBe('login');
    expect(location.searchParams.get('max_age')).toBe('0');
    expect(location.searchParams.get('login_hint')).toBe(p.email);
    expect(new URL(to).pathname + new URL(to).search + new URL(to).hash).toBe(
      '/settings/account?google=confirmed#delete',
    );
    expect(proof).toBeTruthy();

    // Without the proof: the plain "confirm with Google first" answer, nothing happens.
    const before = await call(
      authHandlers.deleteAccount,
      'POST',
      '/api/me/delete-account',
      {},
      { cookie: p.session },
    );
    expect(before.data.error?.message).toBe(NO_PASSWORD_MESSAGE);
    // With it: closed.
    const closed = await call(
      authHandlers.deleteAccount,
      'POST',
      '/api/me/delete-account',
      {},
      { cookie: `${p.session}; ${proof}` },
    );
    expect(closed.res.status).toBe(200);
  });

  it('the proof belongs to one session: the same person on another session still has to confirm', async () => {
    const p = await googleOnlyPerson();
    const { proof } = await confirm(p.session, { email: p.email });
    const other = await googleOnlyPersonSessionFor(p.email);
    const r = await call(
      authHandlers.deleteAccount,
      'POST',
      '/api/me/delete-account',
      {},
      { cookie: `${other}; ${proof}` },
    );
    expect(r.data.error?.message).toBe(NO_PASSWORD_MESSAGE);
  });

  it('a different Google account, or a sign-in Google says is old, confirms nothing', async () => {
    const p = await googleOnlyPerson();
    const wrong = await confirm(p.session, { email: 'someone-else@gmail.com' });
    expect(wrong.to).toMatch(/\/settings\/account\?google=other-account#delete$/);
    expect(wrong.proof).toBeUndefined();
    const stale = await confirm(p.session, {
      email: p.email,
      auth_time: Math.floor(Date.now() / 1000) - 3600,
    });
    expect(stale.to).toMatch(/\/settings\/account\?google=failed#delete$/);
    expect(stale.proof).toBeUndefined();
  });

  it('comes back only to a Settings page of ours, never to another site', async () => {
    const p = await googleOnlyPerson();
    for (const next of [
      'https://evil.example/x',
      '//evil.example',
      '/settings/../logout',
      'javascript:alert(1)',
    ]) {
      const { to } = await confirm(p.session, { email: p.email }, next);
      expect(new URL(to).origin).toBe(new URL(process.env.APP_URL ?? 'http://localhost:3000').origin);
      expect(new URL(to).pathname).toBe('/settings/account');
    }
  });

  it('an account WITH a password still needs the password: a Google confirmation is not a substitute', async () => {
    const u = await verifiedUser(kit);
    const session = (await loginAs(u)).cookie!;
    const { proof } = await confirm(session, { email: u.email, hd: 'example.com' });
    expect(proof).toBeTruthy();
    const r = await call(
      authHandlers.deleteAccount,
      'POST',
      '/api/me/delete-account',
      {},
      { cookie: `${session}; ${proof}` },
    );
    expect(r.data.error?.fields?.password).toBe('That password is not right.');
  });

  /** A second session for a Google-only person: sign in with Google again. */
  async function googleOnlyPersonSessionFor(email: string): Promise<string> {
    const { cb } = await roundTrip({ email });
    const r = await call(
      authHandlers.login,
      'POST',
      '/api/auth/login',
      { google: true },
      { cookie: named(cb.res, 'google-proven')! },
    );
    return cookieFrom(r.res)!;
  }
});
