import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DELETE as removeRoute } from '@/app/api/capsules/[id]/route';
import { GET as listRoute, POST as sealRoute } from '@/app/api/capsules/route';
import { openDue } from '@/modules/capsules';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import { addDays, addYears, dayOf } from '@/shared/calendar';
import {
  call,
  freshAuthState,
  request,
  settledUser,
  signedInUser,
  stable,
  uniqueUser,
  type TestKit,
} from '../helpers/auth';
import { actOnAccount, makeRole } from '../helpers/moderation';
import { doAct, q } from '../helpers/social';

/** ADR-028: Time Capsules — sealed words to myself or one Pal, opened on their day if we are still Pals. */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof settledUser>>;
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const today = () => dayOf(new Date());
const tomorrow = () => addDays(today(), 1);

interface Mine {
  opened: { id: string; from: { handle: string } | null; body: string }[];
  coming: { from: { handle: string } | null; openOn: string }[];
  sealed: { id: string; to: { handle: string } | null; openOn: string }[];
}
const seal = (p: P, to: string, body: string, openOn = tomorrow()) =>
  call(sealRoute, 'POST', '/api/capsules', { to, body, openOn }, as(p));
const mine = async (p: P) => {
  const r = await call(listRoute, 'GET', '/api/capsules', undefined, as(p));
  return { status: r.status, text: r.text, data: r.data as unknown as Mine };
};
async function remove(p: P, id: string) {
  const res = await removeRoute(request('DELETE', `/api/capsules/${id}`, undefined, as(p)), {
    params: Promise.resolve({ id }),
  });
  return res.status;
}
/** Bring every sealed capsule's day forward to today. */
const makeDue = () => q('update time_capsules set open_on = $1 where opened_at is null', [today()]);
const chimes = async (type = 'capsule_opened') =>
  (await q('select recipient_id, actor_id from notifications where type = $1', [type])).rows;
async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

describe('sealing', () => {
  it('to my future self: listed as sealed and coming, with the words shown to nobody (me included)', async () => {
    const me = await person('me');
    expect((await seal(me, 'me', 'Dear future me: the secret words')).status).toBe(201);
    const m = await mine(me);
    expect(m.data.sealed).toMatchObject([{ to: null, openOn: tomorrow() }]);
    expect(m.data.coming).toMatchObject([{ from: null, openOn: tomorrow() }]);
    expect(m.data.opened).toEqual([]);
    expect(m.text).not.toContain('secret words');
  });

  it('to a Pal: they see that one is coming and when, never the words', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await pals(a, b);
    expect((await seal(a, b.handle, 'Happy birthday, secret surprise')).status).toBe(201);
    const theirs = await mine(b);
    expect(theirs.data.coming).toEqual([
      { from: expect.objectContaining({ handle: a.handle }), openOn: tomorrow() },
    ]);
    expect(theirs.text).not.toContain('secret surprise');
    expect((await mine(a)).data.sealed).toMatchObject([{ to: { handle: b.handle } }]);
    expect((await mine(a)).text).not.toContain('secret surprise');
  });

  it('only to a Pal: a stranger, a made-up call sign and myself-by-name are all the same 404', async () => {
    const a = await person('alice');
    const stranger = await person('stranger');
    const missing = await seal(a, 'nobody_home_here', 'hi');
    expect(missing.status).toBe(404);
    for (const r of [await seal(a, stranger.handle, 'hi'), await seal(a, a.handle, 'hi')]) {
      expect(r.status).toBe(404);
      expect(stable(r.data)).toBe(stable(missing.data));
    }
    expect((await q('select count(*)::int n from time_capsules')).rows[0].n).toBe(0);
  });

  it('a blocked Pal is not a Pal', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await pals(a, b);
    await doAct(a.handle, 'block', as(b));
    expect((await seal(a, b.handle, 'hi')).status).toBe(404);
  });

  it('the day must be between tomorrow and 5 years from now', async () => {
    const me = await person('me');
    for (const openOn of [
      today(),
      addDays(today(), -1),
      addDays(addYears(today(), 5), 1),
      `${Number(today().slice(0, 4)) + 1}-02-30`,
      'soon',
    ]) {
      expect((await seal(me, 'me', 'x', openOn)).status, openOn).toBe(422);
    }
    expect((await seal(me, 'me', 'x', addYears(today(), 5))).status).toBe(201);
  });

  it('the words are checked: empty, too long or disguised are refused', async () => {
    const me = await person('me');
    for (const body of ['', '   ', 'x'.repeat(501), `hi${String.fromCharCode(0x202e)}there`]) {
      expect((await seal(me, 'me', body)).status).toBe(422);
    }
  });

  it('at most 3 waiting for one Pal and 20 in all', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await pals(a, b);
    for (let i = 0; i < 3; i++) expect((await seal(a, b.handle, `n${i}`)).status).toBe(201);
    expect((await seal(a, b.handle, 'one more')).status).toBe(409);
    await q(
      `insert into time_capsules (author_id, recipient_id, body, open_on)
       select id, id, 'filler', $2 from users, generate_series(1, 17) where handle = $1`,
      [a.handle, tomorrow()],
    );
    expect((await seal(a, 'me', 'the 21st')).status).toBe(409);
  });

  it('a brand-new account can seal only 3 a day (first-week budget)', async () => {
    setRateLimiter(new MemoryRateLimiter());
    const fresh = await signedInUser(kit, uniqueUser('fresh'));
    for (let i = 0; i < 3; i++) expect((await seal(fresh as P, 'me', `n${i}`)).status).toBe(201);
    expect((await seal(fresh as P, 'me', 'n4')).status).toBe(429);
  });
});

describe('opening', () => {
  it('on its day it opens when the recipient looks, with a Chime; the words appear only now', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await pals(a, b);
    await seal(a, b.handle, 'Opened at last');
    await makeDue();
    const m = await mine(b);
    expect(m.data.opened).toMatchObject([{ from: { handle: a.handle }, body: 'Opened at last' }]);
    expect(m.data.coming).toEqual([]);
    await flushBackground();
    expect(await chimes()).toHaveLength(1);
    // The writer sees it is no longer sealed, and still not the words (it is the recipient's now).
    expect((await mine(a)).data.sealed).toEqual([]);
    expect((await mine(a)).text).not.toContain('Opened at last');
  });

  it('a capsule to myself rings me too', async () => {
    const me = await person('me');
    await seal(me, 'me', 'Hello me');
    await makeDue();
    expect((await mine(me)).data.opened).toMatchObject([{ from: null, body: 'Hello me' }]);
    await flushBackground();
    const [chime] = await chimes();
    expect(chime!.recipient_id).toBe(chime!.actor_id);
  });

  it('the daily job opens it even if nobody looked; opening twice rings once', async () => {
    const me = await person('me');
    await seal(me, 'me', 'job');
    await makeDue();
    const [x, y] = await Promise.all([openDue(), openDue()]);
    expect(x.capsulesOpened + y.capsulesOpened).toBe(1);
    await flushBackground();
    expect(await chimes()).toHaveLength(1);
  });

  it('no longer Pals on the day: it never opens, and the words are deleted', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await pals(a, b);
    await seal(a, b.handle, 'too late');
    await doAct(a.handle, 'leave', as(b));
    // Before the day it is no longer shown as coming.
    expect((await mine(b)).data.coming).toEqual([]);
    await makeDue();
    expect((await mine(b)).data.opened).toEqual([]);
    expect((await q('select count(*)::int n from time_capsules')).rows[0].n).toBe(0);
    await flushBackground();
    expect(await chimes()).toEqual([]);
  });

  it('a block on the day: it never opens', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await pals(a, b);
    await seal(a, b.handle, 'blocked');
    await doAct(b.handle, 'block', as(a));
    await makeDue();
    expect(await openDue()).toEqual({ capsulesOpened: 0, capsulesDropped: 1 });
    expect((await q('select count(*)::int n from time_capsules')).rows[0].n).toBe(0);
  });

  it('a suspended writer: it waits (neither opens nor is lost), and opens once they are back', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const mod = await person('mod');
    await makeRole(mod.handle, 'moderator');
    await pals(a, b);
    await seal(a, b.handle, 'patience');
    await actOnAccount(a.handle, 'suspend', as(mod));
    await makeDue();
    expect(await openDue()).toEqual({ capsulesOpened: 0, capsulesDropped: 0 });
    await actOnAccount(a.handle, 'reinstate', as(mod));
    expect(await openDue()).toEqual({ capsulesOpened: 1, capsulesDropped: 0 });
  });

  it('with Time Capsule Chimes switched off it still opens, quietly', async () => {
    const me = await person('me');
    await q(
      'insert into notification_prefs (user_id, capsules) select id, false from users where handle = $1',
      [me.handle],
    );
    await seal(me, 'me', 'quiet');
    await makeDue();
    expect((await mine(me)).data.opened).toHaveLength(1);
    await flushBackground();
    expect(await chimes()).toEqual([]);
  });
});

describe('removing', () => {
  it('I can take back one I sealed before it opens; the recipient cannot remove it; strangers get 404', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const stranger = await person('stranger');
    await pals(a, b);
    await seal(a, b.handle, 'maybe not');
    const id = (await mine(a)).data.sealed[0]!.id;
    expect(await remove(b, id)).toBe(404);
    expect(await remove(stranger, id)).toBe(404);
    expect(await remove(a, id)).toBe(200);
    expect((await mine(b)).data.coming).toEqual([]);
  });

  it('once open it is the recipient’s: they can delete it, the writer cannot', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await pals(a, b);
    await seal(a, b.handle, 'yours now');
    await makeDue();
    const id = (await mine(b)).data.opened[0]!.id;
    expect(await remove(a, id)).toBe(404);
    expect(await remove(b, id)).toBe(200);
    expect((await mine(b)).data.opened).toEqual([]);
    expect(await remove(b, 'not-an-id')).toBe(404);
  });

  it('signed out is 401', async () => {
    expect((await call(listRoute, 'GET', '/api/capsules')).status).toBe(401);
  });
});
