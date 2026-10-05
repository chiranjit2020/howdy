import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { passkeys, recoveryCodes, sessions, totpFactors, users } from '@db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { accountExport, authHandlers, hasTwoStep, purgeExpiredAuthData } from '@/modules/auth';
import { INVALID_CREDENTIALS_MESSAGE } from '@/modules/auth/accounts';
import { moderatorStanding } from '@/modules/moderation';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import { totpCode } from '@/modules/auth/totp';
import {
  auditEvents,
  call as rawCall,
  cookieFrom,
  db,
  freshAuthState,
  loginAs,
  me,
  request,
  signedInUser,
  stable,
  tokenFrom,
  uniqueUser,
  userByEmail,
  type TestKit,
} from '../helpers/auth';
import { actOnAccount, giveTwoStep, makeRole, queue } from '../helpers/moderation';
import { SoftPasskey, type Ceremony } from '../helpers/passkey';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

/** Response bodies here are many shapes (options, codes, errors with data); the assertions check them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wire = any;
const call = async (...args: Parameters<typeof rawCall>) => {
  const r = await rawCall(...args);
  return { ...r, data: r.data as Wire };
};

type P = Awaited<ReturnType<typeof signedInUser>>;
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const idOf = async (p: { email: string }) => (await userByEmail(p.email))!.id;

/** A handler that takes route params (e.g. /api/me/two-step/passkeys/:id). */
async function callWith(
  handler: (req: Request, arg?: { params?: Promise<Record<string, string>> }) => Promise<Response>,
  method: string,
  path: string,
  params: Record<string, string>,
  body: unknown,
  opts: { cookie?: string } = {},
) {
  const res = await handler(request(method, path, body, opts), { params: Promise.resolve(params) });
  const text = await res.text();
  return { res, status: res.status, data: JSON.parse(text || '{}') as Wire, text };
}

// ─── the authenticator app ───────────────────────────────────────────────────────────────────────────────────────────

const startApp = (p: P, password = p.password) =>
  call(authHandlers.appStart, 'POST', '/api/me/two-step/app', { password }, as(p));
const confirmApp = (p: P, code: string) =>
  call(authHandlers.appConfirm, 'POST', '/api/me/two-step/app/confirm', { code }, as(p));

/** Link an app for real (through the API) and return its secret and the first recovery codes. */
async function linkApp(p: P) {
  const started = await startApp(p);
  expect(started.status).toBe(200);
  const secret = started.data.secret as string;
  const done = await confirmApp(p, totpCode(secret));
  expect(done.status).toBe(200);
  await flushBackground();
  return { secret, recoveryCodes: done.data.recoveryCodes as string[] };
}

/** A code for the NEXT 30-second step: the current one was spent when the app was confirmed. */
const nextCode = (secret: string) => totpCode(secret, Date.now() + 30_000);
const signIn = (body: Record<string, unknown>) => call(authHandlers.login, 'POST', '/api/auth/login', body);
const withPassword = (p: { email: string; password: string }, extra: Record<string, unknown> = {}) =>
  signIn({ identifier: p.email, password: p.password, ...extra });

describe('linking an authenticator app', () => {
  it('needs the password typed again; a wrong one stores nothing', async () => {
    const a = await signedInUser(kit);
    const r = await startApp(a, 'not my password at all');
    expect(r.status).toBe(400);
    expect(r.data.error?.fields?.password).toBeTruthy();
    expect(await db().select().from(totpFactors)).toHaveLength(0);
  });

  it('counts only after a correct code; stores the key sealed, never in the clear', async () => {
    const a = await signedInUser(kit);
    const started = await startApp(a);
    expect(started.data).toEqual({
      secret: expect.stringMatching(/^[A-Z2-7]{32}$/),
      uri: expect.stringMatching(/^otpauth:\/\/totp\/Howdy%3A/),
      qr: expect.stringMatching(/^data:image\/png;base64,/),
    });
    const [row] = await db().select().from(totpFactors);
    expect(row!.confirmedAt).toBeNull();
    expect(row!.secretEnc).not.toContain(started.data.secret);
    expect(await hasTwoStep(await idOf(a))).toBe(false);

    const wrong = await confirmApp(
      a,
      totpCode(started.data.secret as string) === '000000' ? '111111' : '000000',
    );
    expect(wrong.status).toBe(400);
    expect(await hasTwoStep(await idOf(a))).toBe(false);
    // The password still signs in alone.
    expect((await loginAs(a)).status).toBe(200);
  });

  it('turning it on: 10 recovery codes once, every OTHER device signed out, an email, an audit entry', async () => {
    const a = await signedInUser(kit);
    const laptop = await loginAs(a);
    const { recoveryCodes: codes } = await linkApp(a);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect((await me(a.cookie)).status).toBe(200); // this device stays
    expect((await me(laptop.cookie)).status).toBe(401); // the other one is out
    const mail = kit.mailer.lastTo(a.email)!;
    expect(mail.subject).toBe('Two-step sign-in is on');
    for (const c of codes) expect(mail.text).not.toContain(c);
    expect(await auditEvents(await idOf(a))).toEqual(expect.arrayContaining(['app_added', 'two_step_on']));
    // Only hashes are stored.
    const stored = await db().select().from(recoveryCodes);
    expect(stored).toHaveLength(10);
    for (const c of codes) expect(JSON.stringify(stored)).not.toContain(c.replace('-', ''));
  });

  it('cannot be started again while one is linked; an unfinished setup runs out and is purged', async () => {
    const a = await signedInUser(kit);
    await linkApp(a);
    expect((await startApp(a)).status).toBe(409);

    const b = await signedInUser(kit);
    const s = await startApp(b);
    await db()
      .update(totpFactors)
      .set({ createdAt: sql`now() - interval '16 minutes'` })
      .where(eq(totpFactors.userId, await idOf(b)));
    expect((await confirmApp(b, totpCode(s.data.secret as string))).status).toBe(400);
    const purged = await purgeExpiredAuthData();
    expect(purged.unfinishedApps).toBe(1);
    // The linked one is never touched by the purge.
    expect(await hasTwoStep(await idOf(a))).toBe(true);
  });
});

describe('signing in once two-step is on', () => {
  it('the password alone is not enough — and the wrong password says nothing about two-step', async () => {
    const a = await signedInUser(kit);
    await linkApp(a);
    const r = await withPassword(a);
    expect(r.status).toBe(401);
    expect(r.data.error?.code).toBe('SECOND_STEP_REQUIRED');
    expect(r.data.error?.data).toEqual({ app: 'yes', passkey: 'no' });
    expect(cookieFrom(r.res)).toBeUndefined();

    // Wrong password (with or without a code): the same answer as an account that does not exist.
    const wrong = await withPassword({ email: a.email, password: 'wrong wrong wrong' }, { code: '123456' });
    const nobody = await withPassword(
      { email: 'nobody@example.com', password: 'wrong wrong wrong' },
      { code: '123456' },
    );
    expect(wrong.status).toBe(401);
    expect(wrong.data.error?.message).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(stable(wrong.data)).toBe(stable(nobody.data));
  });

  it('a right code signs in; the same code never works twice; a wrong code is refused', async () => {
    const a = await signedInUser(kit);
    const { secret } = await linkApp(a);
    // The code used to confirm the app is already spent.
    expect((await withPassword(a, { code: totpCode(secret) })).status).toBe(401);
    const code = nextCode(secret);
    const ok = await withPassword(a, { code });
    expect(ok.status).toBe(200);
    expect(cookieFrom(ok.res)).toBeTruthy();
    expect((await withPassword(a, { code })).status).toBe(401);
    const bad = await withPassword(a, { code: code === '000000' ? '000001' : '000000' });
    expect(bad.status).toBe(401);
    expect(bad.data.error?.fields?.code).toBeTruthy();
    expect(await auditEvents(await idOf(a))).toContain('second_step_failed');
  });

  it('two sign-ins racing with the same code: exactly one wins', async () => {
    const a = await signedInUser(kit);
    const { secret } = await linkApp(a);
    const code = nextCode(secret);
    // Make the race certain: hold the app's row locked so BOTH requests have read it (code not yet used) and are
    // queued to write it before either can. Only the compare-and-set on `last_step` can then stop the second.
    const holder = await getPool().connect();
    try {
      await holder.query('begin');
      await holder.query('select 1 from totp_factors where user_id = $1 for update', [await idOf(a)]);
      const racing = Promise.all([withPassword(a, { code }), withPassword(a, { code })]);
      for (let i = 0; i < 200; i++) {
        const { rows } = await getPool().query<{ n: number }>(
          `select count(*)::int as n from pg_stat_activity
            where wait_event_type = 'Lock' and query like 'update "totp_factors"%'`,
        );
        if (rows[0]!.n === 2) break;
        await new Promise((r) => setTimeout(r, 25));
      }
      await holder.query('commit');
      const results = await racing;
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    } finally {
      holder.release();
    }
  });

  it('a recovery code works once, and the owner is told how many are left', async () => {
    const a = await signedInUser(kit);
    const { recoveryCodes: codes } = await linkApp(a);
    const typed = ` ${codes[3]!.toUpperCase().replace('-', ' ')} `;
    expect((await withPassword(a, { code: typed })).status).toBe(200);
    expect((await withPassword(a, { code: codes[3] })).status).toBe(401);
    await flushBackground();
    const mail = kit.mailer.lastTo(a.email)!;
    expect(mail.subject).toBe('A recovery code was used');
    expect(mail.text).toContain('9 recovery codes left');
    expect(await auditEvents(await idOf(a))).toContain('recovery_code_used');
  });

  it('guessing is limited per account (with the right password every time)', async () => {
    const a = await signedInUser(kit);
    const { secret } = await linkApp(a);
    setRateLimiter(new MemoryRateLimiter());
    const right = nextCode(secret);
    const wrong = right === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) expect((await withPassword(a, { code: wrong })).status).toBe(401);
    const limited = await withPassword(a, { code: right });
    expect(limited.status).toBe(429);
  });

  it('a password reset by email does NOT switch it off', async () => {
    const a = await signedInUser(kit);
    await linkApp(a);
    await call(authHandlers.forgotPassword, 'POST', '/api/auth/forgot-password', { email: a.email });
    await flushBackground();
    const token = tokenFrom(kit.mailer.lastTo(a.email)!.text);
    const password = 'a brand new password 42';
    const reset = await call(authHandlers.resetPassword, 'POST', '/api/auth/reset-password', {
      token,
      password,
    });
    expect(reset.status).toBe(200);
    const r = await withPassword({ email: a.email, password });
    expect(r.data.error?.code).toBe('SECOND_STEP_REQUIRED');
    expect(await hasTwoStep(await idOf(a))).toBe(true);
  });
});

describe('changing it', () => {
  it('unlinking the app needs the password; with no factor left two-step is off and the codes are gone', async () => {
    const a = await signedInUser(kit);
    await linkApp(a);
    const remove = (password: string) =>
      call(authHandlers.appRemove, 'DELETE', '/api/me/two-step/app', { password }, as(a));
    expect((await remove('not it not it not it')).status).toBe(400);
    expect(await hasTwoStep(await idOf(a))).toBe(true);
    expect((await remove(a.password)).status).toBe(200);
    expect(await hasTwoStep(await idOf(a))).toBe(false);
    expect(await db().select().from(recoveryCodes)).toHaveLength(0);
    expect((await withPassword(a)).status).toBe(200);
    await flushBackground();
    expect(kit.mailer.lastTo(a.email)!.subject).toBe('Two-step sign-in is off');
  });

  it('new recovery codes replace the old ones (password needed, two-step must be on)', async () => {
    const a = await signedInUser(kit);
    const renew = (password = a.password) =>
      call(authHandlers.recoveryCodes, 'POST', '/api/me/two-step/recovery-codes', { password }, as(a));
    expect((await renew()).status).toBe(400); // nothing to renew yet
    const { recoveryCodes: old } = await linkApp(a);
    expect((await renew('wrong wrong wrong')).status).toBe(400);
    const fresh = await renew();
    expect(fresh.data.recoveryCodes).toHaveLength(10);
    expect((await withPassword(a, { code: old[0] })).status).toBe(401);
    expect((await withPassword(a, { code: (fresh.data.recoveryCodes as string[])[0] })).status).toBe(200);
  });

  it('every change needs a live session', async () => {
    for (const [h, method, path] of [
      [authHandlers.appStart, 'POST', '/api/me/two-step/app'],
      [authHandlers.appConfirm, 'POST', '/api/me/two-step/app/confirm'],
      [authHandlers.appRemove, 'DELETE', '/api/me/two-step/app'],
      [authHandlers.recoveryCodes, 'POST', '/api/me/two-step/recovery-codes'],
      [authHandlers.passkeyAddOptions, 'POST', '/api/me/two-step/passkeys/options'],
      [authHandlers.passkeyAdd, 'POST', '/api/me/two-step/passkeys'],
    ] as const) {
      expect((await call(h, method, path, { password: 'x', code: '123456' })).status).toBe(401);
    }
  });
});

// ─── passkeys ────────────────────────────────────────────────────────────────────────────────────────────────────────

const addOptions = (p: P, password = p.password) =>
  call(authHandlers.passkeyAddOptions, 'POST', '/api/me/two-step/passkeys/options', { password }, as(p));

async function addKey(p: P, key = new SoftPasskey(), over: Ceremony = {}) {
  const opts = await addOptions(p);
  expect(opts.status).toBe(200);
  const response = key.register(opts.data.options, over);
  const r = await call(
    authHandlers.passkeyAdd,
    'POST',
    '/api/me/two-step/passkeys',
    { challengeId: opts.data.challengeId, response },
    as(p),
  );
  await flushBackground();
  return { key, r };
}

const passkeyOptions = () => call(authHandlers.passkeyOptions, 'POST', '/api/auth/passkey/options', {});

async function signInWith(key: SoftPasskey, over: Ceremony = {}) {
  const o = await passkeyOptions();
  const response = key.sign(o.data.options, over);
  const r = await call(authHandlers.passkeyLogin, 'POST', '/api/auth/passkey/login', {
    challengeId: o.data.challengeId,
    response,
  });
  return { ...r, cookie: cookieFrom(r.res), challengeId: o.data.challengeId as string, response };
}

describe('passkeys', () => {
  it('adding one needs the password; the first one turns two-step on', async () => {
    const a = await signedInUser(kit);
    expect((await addOptions(a, 'wrong wrong wrong')).status).toBe(400);
    const other = await loginAs(a);
    const { r } = await addKey(a);
    expect(r.status).toBe(200);
    expect(r.data.recoveryCodes).toHaveLength(10);
    expect((await me(other.cookie)).status).toBe(401);
    expect(kit.mailer.lastTo(a.email)!.subject).toBe('Two-step sign-in is on');
    const [row] = await db().select().from(passkeys);
    expect(row).toMatchObject({ name: 'Unknown device', backedUp: true, counter: 0 });
    // A second key is just "added": no new codes, nobody signed out.
    const second = await addKey(a);
    expect(second.r.data.recoveryCodes).toBeUndefined();
    expect(kit.mailer.lastTo(a.email)!.subject).toBe('A passkey was added');
  });

  it('signs in alone: no handle, no password, no code', async () => {
    const a = await signedInUser(kit);
    const { key } = await addKey(a);
    const r = await signInWith(key);
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ user: { id: await idOf(a), handle: a.handle } });
    expect((await me(r.cookie)).status).toBe(200);
    const [row] = await db().select().from(passkeys);
    expect(row!.lastUsedAt).toBeInstanceOf(Date);
    const audit = await db().execute<{ meta: { method?: string } }>(
      sql`select meta from audit_log where event = 'login_success' order by id desc limit 1`,
    );
    expect(audit.rows[0]!.meta.method).toBe('passkey');
  });

  it('the options say nothing about who has an account', async () => {
    const o = await passkeyOptions();
    expect(o.status).toBe(200);
    expect(o.data.options.allowCredentials ?? []).toEqual([]);
    expect(o.data.options.userVerification).toBe('required');
  });

  it('an answer works once (replay), and only for the challenge it signed', async () => {
    const a = await signedInUser(kit);
    const { key } = await addKey(a);
    const first = await signInWith(key);
    expect(first.status).toBe(200);
    const replay = await call(authHandlers.passkeyLogin, 'POST', '/api/auth/passkey/login', {
      challengeId: first.challengeId,
      response: first.response,
    });
    expect(replay.status).toBe(401);
    // Signing a different challenge than the one presented.
    const o = await passkeyOptions();
    const other = await passkeyOptions();
    const mismatched = await call(authHandlers.passkeyLogin, 'POST', '/api/auth/passkey/login', {
      challengeId: o.data.challengeId,
      response: key.sign(other.data.options),
    });
    expect(mismatched.status).toBe(401);
  });

  it('refuses a look-alike site, another relying party, and a missing fingerprint/screen lock', async () => {
    const a = await signedInUser(kit);
    const { key } = await addKey(a);
    for (const over of [
      { origin: 'https://howdy-login.example' },
      { rpId: 'example.com' },
      { uv: false },
      { type: 'webauthn.create' },
    ] satisfies Ceremony[]) {
      const r = await signInWith(key, over);
      expect(r.status, JSON.stringify(over)).toBe(401);
      expect(r.cookie).toBeUndefined();
    }
    expect(await db().select().from(sessions).where(isNull(sessions.revokedAt))).toHaveLength(1);
  });

  it('refuses to ADD a key from a look-alike site or without verification', async () => {
    const a = await signedInUser(kit);
    for (const over of [
      { origin: 'https://evil.example' },
      { uv: false },
      { rpId: 'evil.example' },
    ] satisfies Ceremony[]) {
      const { r } = await addKey(a, new SoftPasskey(), over);
      expect(r.status, JSON.stringify(over)).toBe(400);
    }
    expect(await db().select().from(passkeys)).toHaveLength(0);
  });

  it("an unknown passkey is told so (and one person's add-challenge cannot finish another's)", async () => {
    const stranger = new SoftPasskey();
    const r = await signInWith(stranger);
    expect(r.status).toBe(401);
    expect(r.data.error?.data?.unknownPasskey).toBe('yes');

    const a = await signedInUser(kit);
    const b = await signedInUser(kit);
    const opts = await addOptions(a);
    const hijack = await call(
      authHandlers.passkeyAdd,
      'POST',
      '/api/me/two-step/passkeys',
      { challengeId: opts.data.challengeId, response: new SoftPasskey().register(opts.data.options) },
      as(b),
    );
    expect(hijack.status).toBe(400);
    expect(await db().select().from(passkeys)).toHaveLength(0);
  });

  it('a sign-in challenge cannot be used to add a key', async () => {
    const a = await signedInUser(kit);
    const opts = await addOptions(a);
    const signInChallenge = await passkeyOptions();
    const r = await call(
      authHandlers.passkeyAdd,
      'POST',
      '/api/me/two-step/passkeys',
      {
        challengeId: signInChallenge.data.challengeId,
        response: new SoftPasskey().register(opts.data.options),
      },
      as(a),
    );
    expect(r.status).toBe(400);
  });

  it('a device-bound key whose counter goes backwards (a clone) is refused', async () => {
    const a = await signedInUser(kit);
    const key = new SoftPasskey({ synced: false, counter: 1 });
    await addKey(a, key);
    expect((await signInWith(key)).status).toBe(200); // counter 2
    expect((await signInWith(key, { counter: 2 })).status).toBe(401); // the same count again
    expect((await signInWith(key)).status).toBe(200); // 3: the real device carries on
  });

  it('with only a passkey, a password sign-in asks for the second step', async () => {
    const a = await signedInUser(kit);
    await addKey(a);
    const r = await withPassword(a);
    expect(r.data.error?.code).toBe('SECOND_STEP_REQUIRED');
    expect(r.data.error?.data).toEqual({ app: 'no', passkey: 'yes' });
  });

  it("removing: someone else's passkey is a 404; my last one turns two-step off", async () => {
    const a = await signedInUser(kit);
    const b = await signedInUser(kit);
    await addKey(a);
    const [row] = await db().select().from(passkeys);
    const remove = (p: P, id: string, password = p.password) =>
      callWith(
        authHandlers.passkeyRemove,
        'DELETE',
        `/api/me/two-step/passkeys/${id}`,
        { id },
        { password },
        as(p),
      );
    expect((await remove(b, row!.id)).status).toBe(404);
    expect((await remove(a, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await remove(a, row!.id, 'nope nope nope')).status).toBe(400);
    expect(await db().select().from(passkeys)).toHaveLength(1);
    expect((await remove(a, row!.id)).status).toBe(200);
    expect(await hasTwoStep(await idOf(a))).toBe(false);
    expect(await db().select().from(recoveryCodes)).toHaveLength(0);
  });

  it('at most 10 per account', async () => {
    const a = await signedInUser(kit);
    for (let i = 0; i < 10; i++) await giveTwoStep(a.handle);
    expect((await addOptions(a)).status).toBe(409);
  });

  it('expired challenges are purged', async () => {
    await passkeyOptions();
    await db().execute(sql`update webauthn_challenges set expires_at = now() - interval '1 minute'`);
    expect((await purgeExpiredAuthData()).challenges).toBe(1);
  });
});

// ─── suspended and closing accounts ──────────────────────────────────────────────────────────────────────────────────

async function suspend(p: P) {
  const mod = await signedInUser(kit, uniqueUser('mod'));
  await makeRole(mod.handle, 'moderator');
  expect((await actOnAccount(p.handle, 'suspend', as(mod))).status).toBe(200);
}

describe('a suspended or closing account with two-step', () => {
  it('nothing about the suspension is said before the second step; then a ticket carries the appeal', async () => {
    const a = await signedInUser(kit);
    const { secret } = await linkApp(a);
    await suspend(a);
    expect((await withPassword(a)).data.error?.code).toBe('SECOND_STEP_REQUIRED');
    const r = await withPassword(a, { code: nextCode(secret) });
    expect(r.data.error?.code).toBe('ACCOUNT_SUSPENDED');
    const ticket = r.data.error?.data?.ticket as string;
    expect(ticket).toMatch(/^[0-9a-f-]{36}\.\d{13}\.[A-Za-z0-9_-]{43}$/);

    // The password alone cannot appeal (or close the account) behind two-step's back.
    const pw = { identifier: a.email, password: a.password };
    expect(
      (await call(authHandlers.appeal, 'POST', '/api/auth/appeal', { ...pw, text: 'please' })).data.error
        ?.code,
    ).toBe('SECOND_STEP_REQUIRED');
    expect((await call(authHandlers.close, 'POST', '/api/auth/close', pw)).data.error?.code).toBe(
      'SECOND_STEP_REQUIRED',
    );

    const forged = `${ticket.slice(0, -4)}AAAA`;
    expect(
      (await call(authHandlers.appeal, 'POST', '/api/auth/appeal', { ticket: forged, text: 'please' }))
        .status,
    ).toBe(401);
    expect(
      (await call(authHandlers.appeal, 'POST', '/api/auth/appeal', { ticket, text: 'please' })).status,
    ).toBe(200);
  });

  it('a passkey sign-in on a suspended account gets the notice and a ticket, never a session', async () => {
    const a = await signedInUser(kit);
    const { key } = await addKey(a);
    await suspend(a);
    const r = await signInWith(key);
    expect(r.data.error?.code).toBe('ACCOUNT_SUSPENDED');
    expect(r.data.error?.data?.ticket).toBeTruthy();
    expect(r.cookie).toBeUndefined();
  });

  it('closing: keep it with the ticket, then sign in with the same ticket', async () => {
    const a = await signedInUser(kit);
    const { secret } = await linkApp(a);
    const burn = await call(
      authHandlers.deleteAccount,
      'POST',
      '/api/me/delete-account',
      { password: a.password },
      as(a),
    );
    expect(burn.status).toBe(200);
    const r = await withPassword(a, { code: nextCode(secret) });
    expect(r.data.error?.code).toBe('ACCOUNT_CLOSING');
    const ticket = r.data.error?.data?.ticket as string;
    expect((await call(authHandlers.keep, 'POST', '/api/auth/keep', { ticket })).status).toBe(200);
    const back = await signIn({ ticket });
    expect(back.status).toBe(200);
    expect((await me(cookieFrom(back.res))).status).toBe(200);
  });

  it('a ticket stops working when it expires, and cannot be mixed with a password', async () => {
    const a = await signedInUser(kit);
    const { key } = await addKey(a);
    await suspend(a);
    const ticket = (await signInWith(key)).data.error?.data?.ticket as string;
    const [id, , mac] = ticket.split('.');
    expect((await signIn({ ticket: `${id}.${Date.now() - 1000}.${mac}` })).status).toBe(401);
    // Sent alongside a password, the ticket is ignored: it is a password sign-in, so the second step is still asked.
    const mixed = await signIn({ ticket, identifier: a.email, password: a.password });
    expect(mixed.data.error?.code).toBe('SECOND_STEP_REQUIRED');
  });
});

// ─── staff ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('staff need two-step to moderate', () => {
  it('a moderator without it is told to turn it on; with it, the queue opens; members still get a 404', async () => {
    const mod = await signedInUser(kit, uniqueUser('mod'));
    const member = await signedInUser(kit);
    await makeRole(mod.handle, 'moderator', { twoStep: false });
    const before = await queue(as(mod));
    expect(before.status).toBe(403);
    expect(before.data.error?.message).toMatch(/two-step/);
    expect((await queue(as(member))).status).toBe(404);
    await linkApp(mod);
    expect((await queue(as(mod))).status).toBe(200);
  });

  it("moderation's own check agrees with the auth module's on every kind of factor", async () => {
    const mod = await signedInUser(kit, uniqueUser('mod'));
    await makeRole(mod.handle, 'admin', { twoStep: false });
    const id = await idOf(mod);
    const agree = async (expected: boolean) => {
      expect(await hasTwoStep(id)).toBe(expected);
      expect(await moderatorStanding(id)).toBe(expected ? 'ready' : 'needs_two_step');
    };
    await agree(false);
    const started = await startApp(mod); // unconfirmed: does not count
    await agree(false);
    await confirmApp(mod, totpCode(started.data.secret as string));
    await agree(true);
    await db().delete(totpFactors).where(eq(totpFactors.userId, id));
    await agree(false);
    await giveTwoStep(mod.handle);
    await agree(true);
  });
});

// ─── download my data ────────────────────────────────────────────────────────────────────────────────────────────────

describe('the data export', () => {
  it('says what is set up, never a secret', async () => {
    const a = await signedInUser(kit);
    const { secret, recoveryCodes: codes } = await linkApp(a);
    await addKey(a);
    const out = await accountExport(await idOf(a));
    expect(out.twoStep).toEqual({
      on: true,
      authenticatorApp: true,
      passkeys: [
        {
          device: 'Unknown device',
          syncedToPasswordManager: true,
          addedAt: expect.any(String),
          lastUsedAt: null,
        },
      ],
      recoveryCodesLeft: 10,
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain(secret);
    for (const c of codes) expect(text).not.toContain(c);
    const [key] = await db()
      .select()
      .from(passkeys)
      .where(and(eq(passkeys.userId, await idOf(a))));
    expect(text).not.toContain(key!.credentialId);
    expect(text).not.toContain(key!.publicKey.toString('base64'));
  });

  it('deleting the account takes every factor with it', async () => {
    const a = await signedInUser(kit);
    await linkApp(a);
    await addKey(a);
    await db()
      .delete(users)
      .where(eq(users.id, await idOf(a)));
    expect(await db().select().from(passkeys)).toHaveLength(0);
    expect(await db().select().from(totpFactors)).toHaveLength(0);
    expect(await db().select().from(recoveryCodes)).toHaveLength(0);
  });
});
