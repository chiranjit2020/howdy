import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { fileAppeal as fileAppealDirect, liftExpiredSuspensions } from '@/modules/moderation';
import { getPool } from '@/platform/db';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import { RATE as AUTH_RATE } from '@/modules/auth/config';
import { freshAuthState, loginAs, me, signedInUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import {
  account,
  actOnAccount,
  actOnReport,
  appeals,
  decide,
  fileAppeal,
  makeRole,
  queue,
} from '../helpers/moderation';
import { q, report } from '../helpers/social';

/** ADR-023: suspensions carry a reason and a length, the person is told at sign-in, and may appeal once. */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof signedInUser>>;
const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const statusOf = async (handle: string) =>
  (await q('select status from users where handle = $1', [handle])).rows[0].status as string;
const suspensionRows = async (handle: string) =>
  (
    await q(
      `select s.* from suspensions s join users u on u.id = s.user_id where u.handle = $1 order by s.created_at`,
      [handle],
    )
  ).rows;
const liveRow = async (handle: string) => (await suspensionRows(handle)).find((r) => r.lifted_at === null);
const audit = async (event: string) =>
  (await q('select user_id, meta from audit_log where event = $1', [event])).rows;
const signIn = (p: P, password = p.password) => loginAs({ email: p.email, password });
const errorData = (r: { data: unknown }) =>
  (r.data as { error?: { data?: Record<string, string | null> } }).error?.data;
const appealBody = (p: P, text = 'I think this was a mix-up.', password = p.password) => ({
  identifier: p.email,
  password,
  text,
});

async function moderator(): Promise<P> {
  const m = await person('mod');
  await makeRole(m.handle, 'moderator');
  return m;
}

/** Suspend `p` directly, then move the suspension into the past so that its end has already come. */
async function expiredSuspension(mod: P, p: P) {
  expect((await actOnAccount(p.handle, 'suspend', as(mod))).status).toBe(200);
  await q(
    `update suspensions set created_at = now() - interval '8 days', ends_at = now() - interval '1 day'
     where user_id = (select id from users where handle = $1) and lifted_at is null`,
    [p.handle],
  );
}

describe('suspending records why and for how long', () => {
  it('from a report: the reason defaults to the report, the length is what the moderator chose', async () => {
    const mod = await moderator();
    const a = await person('reporter');
    const b = await person('reported');
    expect((await report({ handle: b.handle, reason: 'harassment' }, as(a))).status).toBe(202);
    const item = (await queue(as(mod))).data.reports![0]!;
    const before = Date.now();
    expect((await actOnReport(item.id, { action: 'suspend', length: '30d' }, as(mod))).status).toBe(200);
    const row = await liveRow(b.handle);
    expect(row).toMatchObject({ reason: 'harassment', report_id: item.id, lift_cause: null });
    const days = (new Date(row!.ends_at).getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it('directly: a moderator picks the reason; "indefinite" has no end date', async () => {
    const mod = await moderator();
    const b = await person('someone');
    const r = await actOnAccount(
      b.handle,
      { action: 'suspend', length: 'indefinite', reason: 'impersonation' },
      as(mod),
    );
    expect(r.status).toBe(200);
    expect(await liveRow(b.handle)).toMatchObject({ reason: 'impersonation', ends_at: null });
    const looked = (await account(b.handle, as(mod))).data.account!;
    expect(looked.suspension).toMatchObject({ reason: 'impersonation', endsAt: null });
  });

  it('a suspension without a length, or with a made-up reason or length, is refused and changes nothing', async () => {
    const mod = await moderator();
    const b = await person('someone');
    for (const body of [
      { action: 'suspend' },
      { action: 'suspend', reason: 'spam' },
      { action: 'suspend', length: '7d', reason: 'being annoying' },
      { action: 'suspend', length: '1000y', reason: 'spam' },
    ]) {
      expect((await actOnAccount(b.handle, body, as(mod))).status).toBe(422);
    }
    expect(await statusOf(b.handle)).toBe('active');
    expect(await suspensionRows(b.handle)).toHaveLength(0);
  });

  it('suspending twice keeps one live suspension; a later suspension is a new row with its own appeal', async () => {
    const mod = await moderator();
    const b = await person('someone');
    await actOnAccount(b.handle, 'suspend', as(mod));
    await actOnAccount(b.handle, 'suspend', as(mod));
    expect(await suspensionRows(b.handle)).toHaveLength(1);
    expect((await fileAppeal(appealBody(b))).status).toBe(200);
    await actOnAccount(b.handle, 'reinstate', as(mod));
    await actOnAccount(b.handle, 'suspend', as(mod));
    const rows = await suspensionRows(b.handle);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ lift_cause: 'reinstated', appeal_status: 'granted' });
    expect(rows[1]).toMatchObject({ lifted_at: null, appeal_status: null });
    expect((await fileAppeal(appealBody(b, 'Second time, still a mistake.'))).status).toBe(200);
  });
});

describe('what a suspended person is told at sign-in', () => {
  it('only after the right password: a wrong one looks exactly like any other wrong password', async () => {
    const mod = await moderator();
    const b = await person('someone');
    const stranger = await person('stranger');
    await actOnAccount(b.handle, { action: 'suspend', length: '7d', reason: 'spam' }, as(mod));
    const wrongSuspended = await signIn(b, 'not the password at all');
    const wrongActive = await signIn(stranger, 'not the password at all');
    expect(wrongSuspended.status).toBe(401);
    expect(stable(wrongSuspended.data)).toBe(stable(wrongActive.data));
    expect(wrongSuspended.text).not.toContain('spam');
  });

  it('with the right password: 403 ACCOUNT_SUSPENDED with the reason, the end date and appeal state; no session', async () => {
    const mod = await moderator();
    const b = await person('someone');
    await actOnAccount(b.handle, { action: 'suspend', length: '7d', reason: 'spam' }, as(mod));
    const r = await signIn(b);
    expect(r.status).toBe(403);
    expect(r.data.error!.code).toBe('ACCOUNT_SUSPENDED');
    expect(r.cookie).toBeUndefined();
    const data = errorData(r)!;
    expect(data.reason).toBe('spam');
    expect(data.appeal).toBe('available');
    expect(new Date(data.endsAt!).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    // Nothing internal leaks: no ids, no moderator.
    expect(r.text).not.toContain(mod.handle);
    expect(Object.keys(data).sort()).toEqual(['appeal', 'endsAt', 'reason']);
  });

  it('an account suspended by hand (no suspension row) is told the generic reason', async () => {
    const b = await person('someone');
    await q(`update users set status = 'suspended' where handle = $1`, [b.handle]);
    const r = await signIn(b);
    expect(r.data.error!.code).toBe('ACCOUNT_SUSPENDED');
    expect(errorData(r)).toEqual({ reason: 'other', endsAt: null, appeal: 'available' });
  });

  it('an account being deleted is still just "not available"', async () => {
    const b = await person('someone');
    await q(`update users set status = 'pending_deletion' where handle = $1`, [b.handle]);
    const r = await signIn(b);
    expect(r.data.error!.code).toBe('ACCOUNT_UNAVAILABLE');
    expect(errorData(r)).toBeUndefined();
  });
});

describe('timed suspensions end by themselves', () => {
  it('signing in after the end date lifts it and signs the person in', async () => {
    const mod = await moderator();
    const b = await person('someone');
    await expiredSuspension(mod, b);
    const r = await signIn(b);
    expect(r.status).toBe(200);
    expect(r.cookie).toBeDefined();
    expect((await me(r.cookie)).status).toBe(200);
    expect(await statusOf(b.handle)).toBe('active');
    expect((await suspensionRows(b.handle))[0]).toMatchObject({ lift_cause: 'expired', lifted_by: null });
    expect(await audit('suspension_expired')).toHaveLength(1);
  });

  it('the daily job lifts ended ones and leaves running and indefinite ones alone', async () => {
    const mod = await moderator();
    const ended = await person('ended');
    const running = await person('running');
    const forever = await person('forever');
    await expiredSuspension(mod, ended);
    await actOnAccount(running.handle, 'suspend', as(mod));
    await actOnAccount(forever.handle, { action: 'suspend', length: 'indefinite', reason: 'spam' }, as(mod));
    expect(await liftExpiredSuspensions()).toEqual({ suspensionsLifted: 1 });
    expect(await statusOf(ended.handle)).toBe('active');
    expect(await statusOf(running.handle)).toBe('suspended');
    expect(await statusOf(forever.handle)).toBe('suspended');
    // idempotent
    expect(await liftExpiredSuspensions()).toEqual({ suspensionsLifted: 0 });
  });

  it('a running suspension is not lifted early by signing in', async () => {
    const mod = await moderator();
    const b = await person('someone');
    await actOnAccount(b.handle, 'suspend', as(mod));
    expect((await signIn(b)).status).toBe(403);
    expect(await statusOf(b.handle)).toBe('suspended');
  });
});

describe('appealing', () => {
  it('needs the right password; an active account has nothing to appeal', async () => {
    const mod = await moderator();
    const b = await person('someone');
    const active = await person('active');
    await actOnAccount(b.handle, 'suspend', as(mod));
    const wrong = await fileAppeal(appealBody(b, 'Please.', 'not the password at all'));
    const unknown = await fileAppeal({
      identifier: 'nobody@example.com',
      password: 'whatever it is',
      text: 'x',
    });
    expect(wrong.status).toBe(401);
    expect(stable(wrong.data)).toBe(stable(unknown.data));
    expect((await liveRow(b.handle))!.appeal_text).toBeNull();
    expect((await fileAppeal(appealBody(active))).status).toBe(400);
    expect(await suspensionRows(active.handle)).toHaveLength(0);
  });

  it('one appeal per suspension; sign-in then says it is waiting', async () => {
    const mod = await moderator();
    const b = await person('someone');
    await actOnAccount(b.handle, 'suspend', as(mod));
    expect((await fileAppeal(appealBody(b))).status).toBe(200);
    expect((await fileAppeal(appealBody(b, 'And another thing'))).status).toBe(409);
    expect(await liveRow(b.handle)).toMatchObject({
      appeal_text: 'I think this was a mix-up.',
      appeal_status: 'open',
    });
    expect(errorData(await signIn(b))!.appeal).toBe('open');
  });

  it('the text is checked: empty, too long or disguised text is refused', async () => {
    const mod = await moderator();
    const b = await person('someone');
    await actOnAccount(b.handle, 'suspend', as(mod));
    for (const text of ['', '   ', 'x'.repeat(501), `hello${String.fromCharCode(0x202e)}evil`]) {
      expect((await fileAppeal(appealBody(b, text))).status).toBe(422);
    }
    expect((await liveRow(b.handle))!.appeal_text).toBeNull();
  });

  it('shares the sign-in rate limits: an appeal is not a second place to guess passwords', async () => {
    setRateLimiter(new MemoryRateLimiter());
    const mod = await moderator();
    const b = await person('someone');
    await actOnAccount(b.handle, 'suspend', as(mod));
    for (let i = 0; i < AUTH_RATE.loginIdentifier.limit; i++) await signIn(b, 'wrong password here');
    expect((await fileAppeal(appealBody(b))).status).toBe(429);
    expect((await liveRow(b.handle))!.appeal_text).toBeNull();
  });

  it('the module itself refuses an appeal for an active account (no suspension row appears)', async () => {
    const b = await person('someone');
    const id = (await q('select id from users where handle = $1', [b.handle])).rows[0].id as string;
    await expect(fileAppealDirect(id, 'Let me in')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await suspensionRows(b.handle)).toHaveLength(0);
  });

  it('an appeal for a suspension set by hand gets a suspension row to live on', async () => {
    const b = await person('someone');
    await q(`update users set status = 'suspended' where handle = $1`, [b.handle]);
    expect((await fileAppeal(appealBody(b))).status).toBe(200);
    expect(await liveRow(b.handle)).toMatchObject({ reason: 'other', appeal_status: 'open' });
  });
});

describe('answering appeals', () => {
  async function appealed() {
    const mod = await moderator();
    const b = await person('someone');
    await actOnAccount(b.handle, { action: 'suspend', length: '30d', reason: 'spam' }, as(mod));
    expect((await fileAppeal(appealBody(b))).status).toBe(200);
    const item = (await appeals(as(mod))).data.appeals!.find((a) => a.person?.handle === b.handle)!;
    return { mod, b, item };
  }

  it('the list shows the person, the suspension and their words; it is hidden from everyone else', async () => {
    const { mod, b, item } = await appealed();
    expect(item).toMatchObject({
      reason: 'spam',
      text: 'I think this was a mix-up.',
      suspendedBy: { handle: mod.handle },
      person: { handle: b.handle, status: 'suspended' },
    });
    const member = await person('member');
    const missing = await account('nobody_home', as(mod));
    for (const r of [await appeals(as(member)), await decide(item.id, 'grant', as(member))]) {
      expect(r.status).toBe(404);
      expect(stable(r.data)).toBe(stable(missing.data));
    }
    expect(await statusOf(b.handle)).toBe('suspended');
    expect((await appeals()).status).toBe(401);
  });

  it('grant lifts the suspension, lets them sign in, and is audited; a second answer is 409', async () => {
    const { mod, b, item } = await appealed();
    expect((await decide(item.id, 'grant', as(mod))).status).toBe(200);
    expect(await statusOf(b.handle)).toBe('active');
    expect((await suspensionRows(b.handle))[0]).toMatchObject({
      lift_cause: 'appeal',
      appeal_status: 'granted',
    });
    expect((await signIn(b)).status).toBe(200);
    expect(await audit('appeal_granted')).toHaveLength(1);
    expect((await decide(item.id, 'uphold', as(mod))).status).toBe(409);
    expect((await appeals(as(mod))).data.appeals).toHaveLength(0);
  });

  it('uphold keeps the suspension; sign-in says so, and there is no second appeal', async () => {
    const { mod, b, item } = await appealed();
    expect((await decide(item.id, 'uphold', as(mod))).status).toBe(200);
    expect(await statusOf(b.handle)).toBe('suspended');
    expect(errorData(await signIn(b))!.appeal).toBe('upheld');
    expect((await fileAppeal(appealBody(b, 'Please look again'))).status).toBe(409);
    expect((await appeals(as(mod))).data.appeals).toHaveLength(0);
    expect(await audit('appeal_upheld')).toHaveLength(1);
    // An answered appeal cannot be answered again the other way.
    expect((await decide(item.id, 'grant', as(await moderator()))).status).toBe(409);
    expect(await statusOf(b.handle)).toBe('suspended');
  });

  it('two moderators answering at once: exactly one decision sticks', async () => {
    const { mod, b, item } = await appealed();
    const other = await moderator();
    const [x, y] = await Promise.all([
      decide(item.id, 'grant', as(mod)),
      decide(item.id, 'uphold', as(other)),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const row = (await suspensionRows(b.handle))[0]!;
    expect(await statusOf(b.handle)).toBe(row.appeal_status === 'granted' ? 'active' : 'suspended');
  });

  it('reinstating by hand answers an open appeal too', async () => {
    const { mod, b } = await appealed();
    await actOnAccount(b.handle, 'reinstate', as(mod));
    expect((await suspensionRows(b.handle))[0]).toMatchObject({
      lift_cause: 'reinstated',
      appeal_status: 'granted',
    });
    expect((await appeals(as(mod))).data.appeals).toHaveLength(0);
  });

  it('an unknown or malformed appeal id is 404; an unknown decision is 422', async () => {
    const { mod, b, item } = await appealed();
    expect((await decide('00000000-0000-4000-8000-000000000000', 'grant', as(mod))).status).toBe(404);
    expect((await decide('../x', 'grant', as(mod))).status).toBe(404);
    expect((await decide(item.id, 'ban_forever', as(mod))).status).toBe(422);
    expect(await statusOf(b.handle)).toBe('suspended');
  });
});
