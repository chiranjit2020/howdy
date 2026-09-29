import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as deleteRoute } from '@/app/api/me/delete-account/route';
import { purgeDeletedAccounts } from '@/app/_lib/account-deletion';
import { authHandlers, purgeFreedHandles } from '@/modules/auth';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import { setObjectStore } from '@/platform/storage';
import {
  call,
  freshAuthState,
  loginAs,
  me,
  settledUser,
  signUpUser,
  stable,
  uniqueUser,
  type TestKit,
} from '../helpers/auth';
import { nail } from '../helpers/fence';
import { freshStore, jpeg, uploadPortrait } from '../helpers/media';
import { actOnAccount, makeRole } from '../helpers/moderation';
import { doAct, q, report } from '../helpers/social';

/** ADR-027: close my account, 14 days to change my mind, then everything goes; the call sign is held back 90 days. */

let kit: TestKit;
let storage: Awaited<ReturnType<typeof freshStore>>;
beforeEach(async () => {
  kit = await freshAuthState();
  storage = await freshStore();
});
afterEach(async () => {
  await storage.cleanup();
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof settledUser>>;
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const burn = (p: P, password = p.password) =>
  call(deleteRoute, 'POST', '/api/me/delete-account', { password }, as(p));
const keep = (p: P, password = p.password) =>
  call(authHandlers.keep, 'POST', '/api/auth/keep', { identifier: p.email, password });
const close = (p: P, password = p.password) =>
  call(authHandlers.close, 'POST', '/api/auth/close', { identifier: p.email, password });
const row = async (handle: string) =>
  (await q('select id, status, deletion_requested_at from users where handle = $1', [handle])).rows[0];
const count = async (sql: string, args: unknown[] = []) => (await q(sql, args)).rows[0].n as number;
/** Move a closing account's request back `days` days. */
const age = (handle: string, days: number) =>
  q(`update users set deletion_requested_at = now() - make_interval(days => $2) where handle = $1`, [
    handle,
    days,
  ]);

describe('asking to delete my account', () => {
  it('needs my password; a wrong one changes nothing', async () => {
    const a = await person('alice');
    const r = await burn(a, 'not my password at all');
    expect(r.status).toBe(400);
    expect(r.data.error?.fields?.password).toBeDefined();
    expect((await row(a.handle)).status).toBe('active');
    expect((await me(a.cookie)).status).toBe(200);
  });

  it('closes it at once: signed out everywhere, marked closing, emailed the date', async () => {
    const a = await person('alice');
    const other = await loginAs(a); // a second device
    const r = await burn(a);
    expect(r.status).toBe(200);
    expect(r.res.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
    expect((await row(a.handle)).status).toBe('pending_deletion');
    expect((await me(a.cookie)).status).toBe(401);
    expect((await me(other.cookie)).status).toBe(401);
    await flushBackground();
    const mail = kit.mailer.lastTo(a.email)!;
    expect(mail.subject).toMatch(/will be deleted/);
    const deleteOn = new Date((r.data as { deleteOn: string }).deleteOn);
    expect((deleteOn.getTime() - Date.now()) / 86_400_000).toBeCloseTo(14, 0);
  });

  it('is rate limited (it checks a password)', async () => {
    setRateLimiter(new MemoryRateLimiter());
    const a = await person('alice');
    for (let i = 0; i < 5; i++) await burn(a, `wrong password ${i}`);
    expect((await burn(a)).status).toBe(429);
    expect((await row(a.handle)).status).toBe('active');
  });
});

describe('the 14 days: signing in offers to keep it', () => {
  it('a wrong password looks like any wrong password; the right one says when it goes, with no session', async () => {
    const a = await person('alice');
    const stranger = await person('bob');
    await burn(a);
    const wrong = await loginAs({ email: a.email, password: 'definitely not it' });
    const wrongOther = await loginAs({ email: stranger.email, password: 'definitely not it' });
    expect(wrong.status).toBe(401);
    expect(stable(wrong.data)).toBe(stable(wrongOther.data));
    const right = await loginAs(a);
    expect(right.status).toBe(403);
    expect(right.data.error?.code).toBe('ACCOUNT_CLOSING');
    expect(right.cookie).toBeUndefined();
    expect((right.data.error as { data?: { deleteOn?: string } }).data?.deleteOn).toBeTruthy();
  });

  it('"Keep my account" needs the password, puts it back, and signing in works again', async () => {
    const a = await person('alice');
    await burn(a);
    expect((await keep(a, 'nope nope nope')).status).toBe(401);
    expect((await row(a.handle)).status).toBe('pending_deletion');
    expect((await keep(a)).status).toBe(200);
    expect(await row(a.handle)).toMatchObject({ status: 'active', deletion_requested_at: null });
    // The sessions that were open when it closed stay dead: keeping it must not revive a lost device.
    expect((await me(a.cookie)).status).toBe(401);
    expect((await loginAs(a)).status).toBe(200);
  });

  it('a suspended account can close itself, and keeping it brings the suspension back (no escape)', async () => {
    const a = await person('alice');
    const mod = await person('mod');
    await makeRole(mod.handle, 'moderator');
    await actOnAccount(a.handle, 'suspend', as(mod));
    // Suspended means no session, so it closes from the sign-in page, with its sign-in details.
    expect((await close(a, 'wrong password here')).status).toBe(401);
    expect((await row(a.handle)).status).toBe('suspended');
    expect((await close(a)).status).toBe(200);
    expect((await row(a.handle)).status).toBe('pending_deletion');
    expect((await keep(a)).status).toBe(200);
    expect((await row(a.handle)).status).toBe('suspended');
    expect((await loginAs(a)).data.error?.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('keeping an account that is not closing is refused', async () => {
    const a = await person('alice');
    expect((await keep(a)).status).toBe(400);
  });
});

describe('after 14 days the daily job deletes it for good', () => {
  it('not a day early', async () => {
    const a = await person('alice');
    await burn(a);
    await age(a.handle, 13);
    expect(await purgeDeletedAccounts()).toMatchObject({ accountsDeleted: 0 });
    expect((await row(a.handle)).status).toBe('pending_deletion');
  });

  it('deletes the account and everything it owns; reports and the audit trail stay without the link', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'accept', as(b));
    expect((await nail(a.handle, { body: 'my own card' }, as(a))).status).toBe(201);
    expect((await uploadPortrait(a.cookie, await jpeg(400, 400))).done?.status).toBe(200);
    expect(await storage.files()).toHaveLength(1);
    await report({ handle: a.handle, reason: 'spam' }, as(b));
    const id = (await row(a.handle)).id as string;

    await burn(a);
    await age(a.handle, 15);
    expect(await purgeDeletedAccounts()).toEqual({ accountsDeleted: 1, accountsDeferred: 0 });

    expect(await row(a.handle)).toBeUndefined();
    expect(await storage.files()).toEqual([]);
    for (const [table, col] of [
      ['profiles', 'user_id'],
      ['credentials', 'user_id'],
      ['sessions', 'user_id'],
      ['media', 'owner_id'],
    ] as const) {
      expect(await count(`select count(*)::int n from ${table} where ${col} = $1`, [id])).toBe(0);
    }
    expect(await count('select count(*)::int n from post_cards where author_id = $1', [id])).toBe(0);
    expect(
      await count('select count(*)::int n from posse_links where user_low = $1 or user_high = $1', [id]),
    ).toBe(0);
    // the report about them is kept, with the link cleared
    expect((await q('select target_user_id from reports')).rows).toEqual([{ target_user_id: null }]);
    expect(await count("select count(*)::int n from audit_log where event = 'account_deleted'")).toBe(1);
    expect(kit.mailer.lastTo(a.email)?.subject).toMatch(/has been deleted/);
    // the other person is untouched
    expect((await row(b.handle)).status).toBe('active');
  });

  it('if a photo file cannot be deleted, the account waits for the next run (nothing is orphaned)', async () => {
    const a = await person('alice');
    expect((await uploadPortrait(a.cookie, await jpeg(400, 400))).done?.status).toBe(200);
    await burn(a);
    await age(a.handle, 15);
    const real = storage.store;
    setObjectStore({
      ...Object.fromEntries(
        Object.getOwnPropertyNames(Object.getPrototypeOf(real)).map((k) => [
          k,
          (real as unknown as Record<string, unknown>)[k],
        ]),
      ),
      delete: async () => {
        throw new Error('storage is down');
      },
    } as unknown as typeof real);
    expect(await purgeDeletedAccounts()).toEqual({ accountsDeleted: 0, accountsDeferred: 1 });
    expect((await row(a.handle)).status).toBe('pending_deletion');
    expect(await count('select count(*)::int n from media')).toBe(1);

    setObjectStore(real);
    expect(await purgeDeletedAccounts()).toEqual({ accountsDeleted: 1, accountsDeferred: 0 });
    expect(await storage.files()).toEqual([]);
  });
});

describe('the call sign is held back for 90 days', () => {
  async function deleted() {
    const a = await person('gone');
    await burn(a);
    await age(a.handle, 15);
    await purgeDeletedAccounts();
    return a;
  }

  it('someone new cannot take it, and is told exactly what "taken" says; only a keyed hash is stored', async () => {
    const a = await deleted();
    const again = await signUpUser(kit, { ...uniqueUser('new'), handle: a.handle });
    const taken = await signUpUser(kit, { ...uniqueUser('new2'), handle: (await person('live')).handle });
    expect(again.response.status).toBe(409);
    expect(stable(again.response.data)).toBe(stable(taken.response.data));
    const stored = (await q('select handle_digest from retired_handles')).rows;
    expect(stored).toHaveLength(1);
    expect(stored[0].handle_digest).not.toContain(a.handle);
    expect(stored[0].handle_digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('after 90 days it is free again (even before the daily job runs), and the job then forgets it', async () => {
    const a = await deleted();
    await q("update retired_handles set available_at = now() - interval '1 minute'");
    const early = await signUpUser(kit, { ...uniqueUser('first'), handle: a.handle });
    expect(early.response.status).toBe(202);
    await q('delete from users where handle = $1', [a.handle]);
    expect(await purgeFreedHandles()).toEqual({ handlesFreed: 1 });
    const again = await signUpUser(kit, { ...uniqueUser('new'), handle: a.handle });
    expect(again.response.status).toBe(202);
  });
});
