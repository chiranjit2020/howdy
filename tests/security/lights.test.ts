import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as litRoute } from '@/app/api/lights/route';
import { DELETE as offRoute, GET as mineRoute, PUT as onRoute } from '@/app/api/me/light/route';
import { lightFor, purgeExpiredLights } from '@/modules/lights';
import { getPool } from '@/platform/db';
import { call, freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { actOnAccount, makeRole } from '../helpers/moderation';
import { doAct, q, userId } from '../helpers/social';

/** ADR-032: Porch Light — "free to talk", seen only by the Pals it is on for, gone without a trace when it goes out. */

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

const on = (p: P, body: Record<string, unknown> = { minutes: 60, audience: 'pals' }) =>
  call(onRoute, 'PUT', '/api/me/light', body, as(p));
const off = (p: P) => call(offRoute, 'DELETE', '/api/me/light', undefined, as(p));
const mine = (p: P) => call(mineRoute, 'GET', '/api/me/light', undefined, as(p));
async function lit(p: P) {
  const r = await call(litRoute, 'GET', '/api/lights', undefined, as(p));
  expect(r.status).toBe(200);
  const data = r.data as unknown as {
    lit: { pal: { handle: string }; note: string | null; until: string }[];
  };
  return { text: r.text, handles: data.lit.map((l) => l.pal.handle), lit: data.lit };
}
/** Does `viewer` see `owner`'s light on their Porch? */
const onPorch = async (viewer: P, owner: P) =>
  (await lightFor(await userId(viewer.handle), await userId(owner.handle))) !== null;
async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
const rows = async () => (await q('select count(*)::int n from porch_lights')).rows[0].n as number;
/** Move a light into the past (both times, so the 2-hour rule still holds). */
const expire = (p: P) =>
  q(
    `update porch_lights set lit_at = now() - interval '3 hours', until_at = now() - interval '1 hour'
     where user_id = (select id from users where handle = $1)`,
    [p.handle],
  );

describe('switching', () => {
  it('on with a note, read back, then off — and off leaves nothing behind', async () => {
    const a = await person('alice');
    const r = await on(a, { minutes: 30, audience: 'close', note: '  free for chai ☕ ' });
    expect(r.status).toBe(200);
    const got = (await mine(a)).data as unknown as {
      light: { audience: string; note: string; until: string };
    };
    expect(got.light).toMatchObject({ audience: 'close', note: 'free for chai ☕' });
    const minutesLeft = (new Date(got.light.until).getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(28);
    expect(minutesLeft).toBeLessThanOrEqual(30);
    expect((await off(a)).status).toBe(200);
    expect(await rows()).toBe(0);
    expect(((await mine(a)).data as unknown as { light: unknown }).light).toBeNull();
    expect((await off(a)).status).toBe(200); // already off: same answer
  });

  it('switching on again replaces the light (one row, new note and audience)', async () => {
    const a = await person('alice');
    await on(a, { minutes: 120, audience: 'pals', note: 'first' });
    await on(a, { minutes: 30, audience: 'close', note: 'second' });
    expect(await rows()).toBe(1);
    expect(((await mine(a)).data as unknown as { light: { note: string } }).light.note).toBe('second');
  });

  it('refuses other lengths, unknown audiences, links, long notes, disguising characters, and strangers', async () => {
    const a = await person('alice');
    for (const body of [
      { minutes: 45, audience: 'pals' },
      { minutes: 240, audience: 'pals' },
      { minutes: '60', audience: 'pals' },
      { minutes: 60, audience: 'everyone' },
      { minutes: 60, audience: 'pals', note: 'see howdy.example.com' },
      { minutes: 60, audience: 'pals', note: 'x'.repeat(61) },
      { minutes: 60, audience: 'pals', note: `hi${String.fromCharCode(0x202e)}there` },
    ]) {
      expect((await on(a, body)).status, JSON.stringify(body)).toBe(422);
    }
    expect(await rows()).toBe(0);
    expect((await call(onRoute, 'PUT', '/api/me/light', { minutes: 60, audience: 'pals' })).status).toBe(401);
    expect((await call(litRoute, 'GET', '/api/lights')).status).toBe(401);
  });

  it('switching is rate limited (so a light cannot be flashed at someone)', async () => {
    const a = await person('alice');
    for (let i = 0; i < 15; i += 1) {
      await on(a);
      await off(a);
    }
    expect((await on(a)).status).toBe(429);
  });
});

describe('who sees it', () => {
  it('all Pals: my Pals see it (with the note), a stranger and someone I only asked do not', async () => {
    const [a, pal, stranger, asked] = await Promise.all([
      person('alice'),
      person('pal'),
      person('stranger'),
      person('asked'),
    ]);
    await pals(a, pal);
    await doAct(asked.handle, 'request', as(a)); // pending, never accepted
    await on(a, { minutes: 60, audience: 'pals', note: 'kettle is on' });
    const seen = await lit(pal);
    expect(seen.handles).toEqual([a.handle]);
    expect(seen.lit[0]!.note).toBe('kettle is on');
    expect((await lit(stranger)).handles).toEqual([]);
    expect((await lit(asked)).handles).toEqual([]);
    expect(await onPorch(pal, a)).toBe(true);
    expect(await onPorch(stranger, a)).toBe(false);
    expect(await onPorch(asked, a)).toBe(false);
  });

  it('Close Pals only: only Pals I marked Close — their marking me does not count', async () => {
    const [a, close, other] = await Promise.all([person('alice'), person('close'), person('other')]);
    await pals(a, close);
    await pals(a, other);
    await doAct(close.handle, 'close', as(a)); // I mark them Close
    await doAct(a.handle, 'close', as(other)); // they mark ME Close: not the same thing
    await on(a, { minutes: 60, audience: 'close' });
    expect((await lit(close)).handles).toEqual([a.handle]);
    expect((await lit(other)).handles).toEqual([]);
    expect(await onPorch(close, a)).toBe(true);
    expect(await onPorch(other, a)).toBe(false);
    // Unmarking takes effect at once.
    await doAct(close.handle, 'unclose', as(a));
    expect((await lit(close)).handles).toEqual([]);
  });

  it('the answer never says who else can see it, nor carries ids', async () => {
    const [a, pal] = await Promise.all([person('alice'), person('pal')]);
    await pals(a, pal);
    await doAct(pal.handle, 'close', as(a));
    await on(a, { minutes: 60, audience: 'close' });
    const { text } = await lit(pal);
    expect(text).not.toMatch(/audience|close|"id"|userId/i);
    expect(text).not.toContain(await userId(a.handle));
  });

  it('a block either way, my Restrict on them, or their Mute of me hides it; my Mute of them does not', async () => {
    const people = await Promise.all(
      ['alice', 'blocked', 'blocker', 'restricted', 'muter', 'muted'].map(person),
    );
    const [a, blocked, blocker, restricted, muter, muted] = people as [P, P, P, P, P, P];
    for (const p of [blocked, blocker, restricted, muter, muted]) await pals(a, p);
    await on(a);
    for (const p of [blocked, blocker, restricted, muter, muted])
      expect((await lit(p)).handles).toEqual([a.handle]);

    await doAct(blocked.handle, 'block', as(a));
    await doAct(a.handle, 'block', as(blocker));
    await doAct(restricted.handle, 'restrict', as(a));
    await doAct(a.handle, 'mute', as(muter)); // the viewer muted the owner: they chose quiet
    await doAct(muted.handle, 'mute', as(a)); // the owner muted the viewer: still an invitation from the owner

    for (const p of [blocked, blocker, restricted, muter]) {
      expect((await lit(p)).handles, p.handle).toEqual([]);
      expect(await onPorch(p, a), p.handle).toBe(false);
    }
    expect((await lit(muted)).handles).toEqual([a.handle]);
    expect(await onPorch(muted, a)).toBe(true);
  });

  it('a block hides it by itself too, not only because blocking ends the Pal link', async () => {
    const [a, b, c] = await Promise.all([person('alice'), person('bob'), person('carol')]);
    await pals(a, b);
    await pals(a, c);
    await on(a);
    // A block row with the link still in place (as during a race): each direction must hide the light on its own.
    await q(
      `insert into user_controls (actor_id, target_id, kind)
       select v.id, o.id, 'block' from users v, users o where v.handle = $1 and o.handle = $2`,
      [b.handle, a.handle],
    );
    await q(
      `insert into user_controls (actor_id, target_id, kind)
       select o.id, v.id, 'block' from users v, users o where v.handle = $1 and o.handle = $2`,
      [c.handle, a.handle],
    );
    for (const p of [b, c]) {
      expect((await lit(p)).handles, p.handle).toEqual([]);
      expect(await onPorch(p, a), p.handle).toBe(false);
    }
  });

  it('an ex-Pal stops seeing it at once', async () => {
    const [a, b] = await Promise.all([person('alice'), person('bob')]);
    await pals(a, b);
    await on(a);
    expect((await lit(b)).handles).toEqual([a.handle]);
    await doAct(a.handle, 'leave', as(b));
    expect((await lit(b)).handles).toEqual([]);
    expect(await onPorch(b, a)).toBe(false);
  });

  it('a suspended owner’s light is not shown, and shows again once they are back', async () => {
    const [a, b, mod] = await Promise.all([person('alice'), person('bob'), person('mod')]);
    await makeRole(mod.handle, 'moderator');
    await pals(a, b);
    await on(a);
    await actOnAccount(a.handle, 'suspend', as(mod));
    expect((await lit(b)).handles).toEqual([]);
    await actOnAccount(a.handle, 'reinstate', as(mod));
    expect((await lit(b)).handles).toEqual([a.handle]);
  });

  it('my own light is not in my list of lit Pals, and lightFor never answers for oneself', async () => {
    const a = await person('alice');
    await on(a);
    expect((await lit(a)).handles).toEqual([]);
    expect(await onPorch(a, a)).toBe(false);
  });
});

describe('going out', () => {
  it('an expired light is off everywhere, and the daily job deletes only expired ones', async () => {
    const [a, b, c] = await Promise.all([person('alice'), person('bob'), person('carol')]);
    await pals(a, b);
    await pals(c, b);
    await on(a);
    await on(c);
    await expire(a);
    expect((await lit(b)).handles).toEqual([c.handle]);
    expect(await onPorch(b, a)).toBe(false);
    expect(((await mine(a)).data as unknown as { light: unknown }).light).toBeNull();
    expect(await purgeExpiredLights()).toEqual({ lightsCleared: 1 });
    expect(await rows()).toBe(1);
  });

  it('the database refuses a light longer than two hours, whatever the code says', async () => {
    const a = await person('alice');
    await on(a);
    await expect(q(`update porch_lights set until_at = lit_at + interval '3 hours'`)).rejects.toThrow(
      /porch_lights_length/,
    );
  });

  it('deleting the account takes the light with it', async () => {
    const a = await person('alice');
    await on(a);
    await q('delete from users where handle = $1', [a.handle]);
    expect(await rows()).toBe(0);
  });
});
