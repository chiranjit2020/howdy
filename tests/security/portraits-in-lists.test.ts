import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as chimesRoute } from '@/app/api/me/chimes/route';
import { attachPortraits } from '@/app/_lib/social';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { call, freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { freshStore, getPortrait, jpeg, uploadPortrait } from '../helpers/media';
import { doAct, q, userId } from '../helpers/social';

/**
 * Portraits in lists (Post Cards, Whispers, Chimes, Tracks, Town Halls, suggestions…): a list may carry someone's photo
 * address ONLY when the viewer may open their Porch — exactly who the Portrait route itself would serve. Everyone else
 * gets no address at all, so a list never reveals who has a photo behind a hidden Porch, a block or a suspension.
 */

let kit: TestKit;
let storage: Awaited<ReturnType<typeof freshStore>>;
beforeEach(async () => {
  kit = await freshAuthState();
  storage = await freshStore();
  setRateLimiter({ consume: async () => ({ allowed: true, remaining: 999, retryAfterSec: 0 }) });
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

async function withPhoto(p: P): Promise<P> {
  const { done } = await uploadPortrait(p.cookie, await jpeg(600, 600));
  expect(done?.status).toBe(200);
  return p;
}

async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

describe('whose Portrait a list may show', () => {
  it('only people whose Porch I may open, and the photo route agrees with every answer', async () => {
    const me = await withPhoto(await person('viewer'));
    const pal = await withPhoto(await person('pal'));
    const open = await withPhoto(await person('open'));
    const hidden = await withPhoto(await person('hidden'));
    const blocksMe = await withPhoto(await person('blocksme'));
    const iBlock = await withPhoto(await person('iblock'));
    const suspended = await withPhoto(await person('suspended'));
    const noPhoto = await person('nophoto');

    await pals(me, pal);
    await q("update profiles set ranch_visibility = 'posse' where user_id = $1", [
      await userId(hidden.handle),
    ]);
    await doAct(me.handle, 'block', as(blocksMe));
    await doAct(iBlock.handle, 'block', as(me));
    await q("update users set status = 'suspended' where handle = $1", [suspended.handle]);

    const everyone = [me, pal, open, hidden, blocksMe, iBlock, suspended, noPhoto];
    const people = everyone.map((p) => ({ handle: p.handle }) as { handle: string; portraitUrl?: string });
    await attachPortraits(await userId(me.handle), people);
    const shown = new Set(people.filter((p) => p.portraitUrl).map((p) => p.handle));

    expect([...shown].sort()).toEqual([me.handle, open.handle, pal.handle].sort());
    for (const p of people) {
      if (p.portraitUrl)
        expect(p.portraitUrl).toMatch(new RegExp(`^/api/portraits/${p.handle}\\?v=[0-9a-f-]{36}$`));
      // The list and the picture itself must never disagree: an address is given exactly when it would be served.
      const served = (await getPortrait(p.handle, as(me))).status === 200;
      expect(served, `served ${p.handle}`).toBe(Boolean(p.portraitUrl));
    }
  });

  it('signed out, nobody’s photo is looked up or shown', async () => {
    const open = await withPhoto(await person('open'));
    const people: { handle: string; portraitUrl?: string }[] = [{ handle: open.handle }];
    await attachPortraits(undefined, people);
    expect(people[0]!.portraitUrl).toBeUndefined();
  });

  it('Chimes: a Pal’s photo shows; a stranger behind a Pals-only Porch stays initials', async () => {
    const me = await person('viewer');
    const pal = await withPhoto(await person('pal'));
    const hidden = await withPhoto(await person('hidden'));
    await q("update profiles set ranch_visibility = 'posse' where user_id = $1", [
      await userId(hidden.handle),
    ]);
    await doAct(pal.handle, 'request', as(me));
    await doAct(me.handle, 'accept', as(pal)); // → me: "said yes"
    await doAct(me.handle, 'request', as(hidden)); // → me: "wants to be your Pal"
    await flushBackground(); // Chimes are delivered just after the response

    const res = await call(chimesRoute, 'GET', '/api/me/chimes', undefined, as(me));
    expect(res.status).toBe(200);
    const actors = (res.data.chimes as { actor: { handle: string; portraitUrl?: string } }[]).map(
      (c) => c.actor,
    );
    expect(actors.find((a) => a.handle === pal.handle)?.portraitUrl).toMatch(/^\/api\/portraits\//);
    const stranger = actors.find((a) => a.handle === hidden.handle);
    expect(stranger).toBeDefined();
    expect(stranger).not.toHaveProperty('portraitUrl');
  });
});
