import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getFenceResource, getFenceResources } from '@/modules/profiles';
import { fenceStanding, fenceStandings } from '@/modules/relationships';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { doAct, q, userId } from '../helpers/social';

/**
 * Phase 13 replaced per-owner lookups with batched ones in the Chimes filter. A privacy decision must not change
 * because it is made in bulk: every batched answer is compared with the single-owner original, for every kind of
 * relationship (both directions where it matters), plus inactive and official owners.
 */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
  // Fifteen sign-ups in one test: this is about equivalence, not limits.
  setRateLimiter({ consume: async () => ({ allowed: true, remaining: 999, retryAfterSec: 0 }) });
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof settledUser>>;
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });

describe('batched lookups give exactly the single-owner answers', () => {
  it('fenceStandings = fenceStanding for every relationship, and getFenceResources = getFenceResource', async () => {
    const me = await person('actor');
    const owners: Record<string, P> = {};
    for (const tag of [
      'passerby',
      'pal',
      'closepal',
      'palrestricts',
      'restricts',
      'mutes',
      'iblock',
      'blocksme',
      'askedme',
      'iasked',
      'iscout',
      'suspended',
      'official',
      'private',
    ]) {
      owners[tag] = await person(tag);
    }
    const o = owners as Record<string, P>;
    // Pals (and a close Pal, marked by the OWNER), then the controls each owner sets on me, or I set on them.
    for (const tag of ['pal', 'closepal', 'palrestricts']) {
      await doAct(o[tag]!.handle, 'request', as(me));
      await doAct(me.handle, 'accept', as(o[tag]!));
    }
    await doAct(me.handle, 'close', as(o.closepal!));
    await doAct(me.handle, 'restrict', as(o.palrestricts!));
    await doAct(me.handle, 'restrict', as(o.restricts!));
    await doAct(me.handle, 'mute', as(o.mutes!));
    await doAct(o.iblock!.handle, 'block', as(me));
    await doAct(me.handle, 'block', as(o.blocksme!));
    await doAct(me.handle, 'request', as(o.askedme!));
    await doAct(o.iasked!.handle, 'request', as(me));
    await doAct(o.iscout!.handle, 'scout', as(me));
    await q("update users set status = 'suspended' where handle = $1", [o.suspended!.handle]);
    await q("update users set role = 'admin' where handle = $1", [o.official!.handle]);
    await q("update profiles set fence_visibility = 'posse', ranch_visibility = 'posse' where user_id = $1", [
      await userId(o.private!.handle),
    ]);

    const meId = await userId(me.handle);
    const ids = [meId, ...(await Promise.all(Object.values(o).map((p) => userId(p.handle))))];
    const [standings, fences] = await Promise.all([fenceStandings(ids, meId), getFenceResources(ids)]);
    const seen = new Set<string>();
    for (const id of ids) {
      expect(standings.get(id), `standing for ${id}`).toEqual(await fenceStanding(id, meId));
      expect(fences.get(id) ?? null, `fence for ${id}`).toEqual(await getFenceResource(id));
      seen.add((await fenceStanding(id, meId)).relationship);
    }
    // The fixture really covers every state the policy distinguishes.
    expect([...seen].sort()).toEqual(
      [
        'BLOCKED',
        'CLOSE_POSSE',
        'MUTED',
        'PASSERBY',
        'POSSE',
        'REQUESTED',
        'RESTRICTED',
        'SCOUTING',
        'UNKNOWN',
      ].sort(),
    );
  });

  it('empty and duplicate inputs', async () => {
    const me = await person('actor');
    const other = await person('other');
    const [meId, otherId] = [await userId(me.handle), await userId(other.handle)];
    expect(await fenceStandings([], meId)).toEqual(new Map());
    expect(await getFenceResources([])).toEqual(new Map());
    expect((await fenceStandings([otherId, otherId], meId)).size).toBe(1);
  });
});
