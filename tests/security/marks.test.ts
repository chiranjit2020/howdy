import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { patchRanch } from '../helpers/ranch';
import { doAct, insertUser, q, userId } from '../helpers/social';
import { giveMarkTo, marksOf } from '../helpers/marks';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
type P = Awaited<ReturnType<typeof person>>;
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const count = async () => (await q('select count(*)::int n from marks')).rows[0].n as number;

async function posse(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
async function open(p: P) {
  await patchRanch({ ranchVisibility: 'everyone' }, as(p));
}
const backdate = (rater: string, target: string, days: number) =>
  q(
    "update marks set created_at = now() - ($3 || ' days')::interval where rater_id = $1 and target_id = $2",
    [rater, target, days],
  );

describe('who may award a Mark', () => {
  it('needs a mutual Posse — a stranger is refused, a Posse member succeeds', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    const friend = await person('friend');
    await open(owner);
    expect((await giveMarkTo(owner.handle, 'chill', as(stranger))).status).toBe(403);
    await posse(owner, friend);
    const ok = await giveMarkTo(owner.handle, 'chill', as(friend));
    expect(ok.status).toBe(201);
    expect(ok.data.kind).toBe('chill');
  });

  it('refuses a Mark for yourself, and needs a session', async () => {
    const owner = await person('owner');
    await open(owner);
    expect((await giveMarkTo(owner.handle, 'gem', as(owner))).status).toBe(403);
    expect((await giveMarkTo(owner.handle, 'gem', {})).status).toBe(401);
  });

  it('a block either way makes the Ranch look not-found (a block hides the Ranch itself, not just the Mark)', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    await doAct(friend.handle, 'block', as(owner));
    expect((await giveMarkTo(owner.handle, 'pure', as(friend))).status).toBe(404);
  });

  it('rejects a kind that is not one of the five', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    expect((await giveMarkTo(owner.handle, 'legendary', as(friend))).status).toBe(422);
  });
});

describe('the 30-day cooldown, per pair', () => {
  it('a second Mark to the same person before 30 days is refused; after, it is allowed', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    expect((await giveMarkTo(owner.handle, 'chill', as(friend))).status).toBe(201);
    expect((await giveMarkTo(owner.handle, 'pure', as(friend))).status).toBe(409); // any kind, same cooldown
    await backdate(await userId(friend.handle), await userId(owner.handle), 31);
    expect((await giveMarkTo(owner.handle, 'pure', as(friend))).status).toBe(201);
    expect(await count()).toBe(2);
  });

  it('the cooldown is per pair: marking a different person is unaffected', async () => {
    const a = await person('a');
    const b = await person('b');
    const c = await person('c');
    await open(a);
    await open(b);
    await posse(a, c);
    await posse(b, c);
    expect((await giveMarkTo(a.handle, 'chill', as(c))).status).toBe(201);
    expect((await giveMarkTo(b.handle, 'chill', as(c))).status).toBe(201);
  });

  it('two racing requests cannot both slip past the cooldown', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    const results = await Promise.all([
      giveMarkTo(owner.handle, 'chill', as(friend)),
      giveMarkTo(owner.handle, 'pure', as(friend)),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect(await count()).toBe(1);
  });
});

describe('the Vibe Matrix — aggregate only, never who or which kind by whom', () => {
  it('counts and percentages are correct, scoped to the right target, and nobody’s identity appears in the response', async () => {
    const owner = await person('owner');
    const other = await person('other'); // a second target: their Marks must never leak into owner's count
    const a = await person('a');
    const b = await person('b');
    const stranger = await person('stranger');
    await open(owner);
    await open(other);
    await posse(owner, a);
    await posse(owner, b);
    await posse(other, a);
    await giveMarkTo(owner.handle, 'chill', as(a));
    await giveMarkTo(owner.handle, 'chill', as(b));
    await giveMarkTo(other.handle, 'gem', as(a));

    const seen = await marksOf(owner.handle, as(stranger));
    expect(seen.data.counts).toEqual({ gem: 0, pure: 0, chill: 2, sharp: 0, bold: 0 });
    expect(seen.data.total).toBe(2);
    expect(seen.text).not.toContain(a.handle);
    expect(seen.text).not.toContain(b.handle);
    expect(seen.text).not.toMatch(/raterId|rater_id/);

    const seenOther = await marksOf(other.handle, as(stranger));
    expect(seenOther.data.counts).toEqual({ gem: 1, pure: 0, chill: 0, sharp: 0, bold: 0 });
    expect(seenOther.data.total).toBe(1);
  });

  it('the owner cannot Mark themself, and canGive reflects the viewer, not the Ranch', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    expect((await marksOf(owner.handle, as(owner))).data.canGive).toBe(false);
    expect((await marksOf(owner.handle, as(friend))).data.canGive).toBe(true);
    await giveMarkTo(owner.handle, 'chill', as(friend));
    const after = await marksOf(owner.handle, as(friend));
    expect(after.data.canGive).toBe(false);
    expect(after.data.cooldownEndsAt).not.toBeNull();
  });

  it('follows the Ranch’s own visibility: a private Ranch is the same 404 as a missing one', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    await patchRanch({ ranchVisibility: 'posse' }, as(owner));
    expect((await marksOf(owner.handle, as(stranger))).status).toBe(404);
    expect((await marksOf('nobody_here', as(stranger))).status).toBe(404);
  });
});

describe('rate limits', () => {
  it('giving Marks is capped per person, across targets', async () => {
    const friend = await person('friend');
    const f = await userId(friend.handle);
    let status = 0;
    for (let i = 0; i < 31; i++) {
      const owner = await insertUser('owner');
      const [low, high] = f < owner.id ? [f, owner.id] : [owner.id, f];
      await q(
        "insert into posse_links (user_low, user_high, status, requested_by) values ($1, $2, 'accepted', $1)",
        [low, high],
      );
      status = (await giveMarkTo(owner.handle, 'chill', as(friend))).status;
    }
    expect(status).toBe(429);
  });
});

describe('database invariants', () => {
  it('refuses a self-Mark and an unknown kind', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const o = await userId(owner.handle);
    const f = await userId(friend.handle);
    await expect(
      q("insert into marks (rater_id, target_id, kind, from_pal) values ($1, $1, 'chill', true)", [o]),
    ).rejects.toThrow(/marks_not_self/);
    await expect(
      q("insert into marks (rater_id, target_id, kind, from_pal) values ($1, $2, 'legendary', true)", [f, o]),
    ).rejects.toThrow(/marks_kind_check/);
    // Cinema and Sigma were retired for Sharp and Bold (migration 0014).
    await expect(
      q("insert into marks (rater_id, target_id, kind, from_pal) values ($1, $2, 'cinema', true)", [f, o]),
    ).rejects.toThrow(/marks_kind_check/);
    await q("insert into marks (rater_id, target_id, kind, from_pal) values ($1, $2, 'sharp', true)", [f, o]);
  });

  it('deleting either person removes their Marks', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    await giveMarkTo(owner.handle, 'chill', as(friend));
    await q('delete from users where handle = $1', [friend.handle]);
    expect(await count()).toBe(0);
  });
});
