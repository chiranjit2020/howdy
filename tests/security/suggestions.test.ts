import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as dismissRoute } from '@/app/api/pals/suggestions/dismiss/route';
import { GET as listRoute } from '@/app/api/pals/suggestions/route';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { call, freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { doAct, q, userId } from '../helpers/social';

/** ADR-029: Pals you may know — Pals of at least two of my Pals, and never anyone a hidden choice rules out. */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
  // Many sign-ups per test: this is about suggestions, not limits.
  setRateLimiter({ consume: async () => ({ allowed: true, remaining: 999, retryAfterSec: 0 }) });
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof settledUser>>;
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
interface S {
  handle: string;
  shared: number;
  via: { handle: string }[];
}
const suggested = async (p: P) =>
  ((await call(listRoute, 'GET', '/api/pals/suggestions', undefined, as(p))).data.suggestions ?? []) as S[];
const handles = async (p: P) => (await suggested(p)).map((s) => s.handle);
async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

/** me has Pals a and b; x is Pals with both (2 shared), y with only a (1 shared). */
async function world() {
  const me = await person('me');
  const a = await person('ann');
  const b = await person('ben');
  const x = await person('xena');
  const y = await person('yuri');
  await pals(me, a);
  await pals(me, b);
  await pals(a, x);
  await pals(b, x);
  await pals(a, y);
  return { me, a, b, x, y };
}

describe('who is suggested', () => {
  it('Pals of at least two of my Pals, with how many and which, and never someone with only one', async () => {
    const { me, a, b, x } = await world();
    const s = await suggested(me);
    expect(s.map((v) => v.handle)).toEqual([x.handle]);
    expect(s[0]!.shared).toBe(2);
    expect(s[0]!.via.map((v) => v.handle).sort()).toEqual([a.handle, b.handle].sort());
  });

  it('more shared Pals first', async () => {
    const { me, a, b, x } = await world();
    const c = await person('cora');
    const z = await person('zed');
    await pals(me, c);
    for (const p of [a, b, c]) await pals(p, z);
    expect(await handles(me)).toEqual([z.handle, x.handle]);
  });

  it('not my Pals already, not me', async () => {
    const { me, x } = await world();
    await pals(me, x);
    expect(await handles(me)).toEqual([]);
  });

  it('nobody I have any ask with: mine, theirs, or one that was declined', async () => {
    for (const setup of ['i-asked', 'they-asked', 'declined'] as const) {
      kit = await freshAuthState();
      setRateLimiter({ consume: async () => ({ allowed: true, remaining: 999, retryAfterSec: 0 }) });
      const { me, x } = await world();
      if (setup === 'i-asked') await doAct(x.handle, 'request', as(me));
      if (setup === 'they-asked') await doAct(me.handle, 'request', as(x));
      if (setup === 'declined') {
        await doAct(x.handle, 'request', as(me));
        await doAct(me.handle, 'decline', as(x));
      }
      expect(await handles(me), setup).toEqual([]);
    }
  });

  it('nobody with a block, mute or restrict between us, in either direction', async () => {
    for (const [kind, who] of [
      ['block', 'me'],
      ['block', 'them'],
      ['mute', 'me'],
      ['mute', 'them'],
      ['restrict', 'me'],
      ['restrict', 'them'],
    ] as const) {
      kit = await freshAuthState();
      setRateLimiter({ consume: async () => ({ allowed: true, remaining: 999, retryAfterSec: 0 }) });
      const { me, x } = await world();
      if (who === 'me') await doAct(x.handle, kind, as(me));
      else await doAct(me.handle, kind, as(x));
      expect(await handles(me), `${kind} by ${who}`).toEqual([]);
    }
  });

  it('nobody suspended, nobody who switched suggestions off, nobody whose Porch is Pals-only', async () => {
    for (const setup of ['suspended', 'off', 'private'] as const) {
      kit = await freshAuthState();
      setRateLimiter({ consume: async () => ({ allowed: true, remaining: 999, retryAfterSec: 0 }) });
      const { me, x } = await world();
      const id = await userId(x.handle);
      if (setup === 'suspended') await q("update users set status = 'suspended' where id = $1", [id]);
      if (setup === 'off') await q('update profiles set discoverable = false where user_id = $1', [id]);
      if (setup === 'private')
        await q("update profiles set ranch_visibility = 'posse' where user_id = $1", [id]);
      expect(await handles(me), setup).toEqual([]);
    }
  });

  it('switching it off works through the Workshop setting', async () => {
    const { me, x } = await world();
    const { PATCH } = await import('@/app/api/me/porch/route');
    expect((await call(PATCH, 'PATCH', '/api/me/porch', { discoverable: false }, as(x))).status).toBe(200);
    expect(await handles(me)).toEqual([]);
  });
});

describe('Not now', () => {
  it('a dismissed person is never suggested again; they are not told', async () => {
    const { me, x } = await world();
    expect(
      (await call(dismissRoute, 'POST', '/api/pals/suggestions/dismiss', { handle: x.handle }, as(me)))
        .status,
    ).toBe(200);
    expect(await handles(me)).toEqual([]);
    // Only my list changes.
    expect((await q('select count(*)::int n from notifications')).rows[0].n).toBe(
      (
        await q(
          "select count(*)::int n from notifications where type in ('posse_requested', 'posse_accepted')",
        )
      ).rows[0].n,
    );
  });

  it('the same answer for a real person, a made-up call sign and myself', async () => {
    const { me } = await world();
    for (const handle of ['nobody_here_at_all', me.handle]) {
      expect(
        (await call(dismissRoute, 'POST', '/api/pals/suggestions/dismiss', { handle }, as(me))).status,
      ).toBe(200);
    }
    expect((await q('select count(*)::int n from suggestion_dismissals')).rows[0].n).toBe(0);
    expect(
      (await call(dismissRoute, 'POST', '/api/pals/suggestions/dismiss', { handle: '../x' }, as(me))).status,
    ).toBe(422);
  });

  it('signed out is 401', async () => {
    expect((await call(listRoute, 'GET', '/api/pals/suggestions')).status).toBe(401);
  });
});
