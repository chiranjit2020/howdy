import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { patchRanch } from '../helpers/ranch';
import { doAct, insertUser, q, userId } from '../helpers/social';
import { giveMarkTo, marksOf, takeBackMark } from '../helpers/marks';

/** ADR-052: the one word a friend picks to describe someone, and how a profile shows them (words, never counts). */

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

describe('who may pick a word for someone', () => {
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

  it('refuses a word for yourself, and needs a session', async () => {
    const owner = await person('owner');
    await open(owner);
    expect((await giveMarkTo(owner.handle, 'gem', as(owner))).status).toBe(403);
    expect((await giveMarkTo(owner.handle, 'gem', {})).status).toBe(401);
    expect((await takeBackMark(owner.handle, {})).status).toBe(401);
  });

  it('a block either way makes the Ranch look not-found (a block hides the Ranch itself, not just the word)', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    await doAct(friend.handle, 'block', as(owner));
    expect((await giveMarkTo(owner.handle, 'pure', as(friend))).status).toBe(404);
  });

  it('rejects a word that is not one of the five', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    expect((await giveMarkTo(owner.handle, 'legendary', as(friend))).status).toBe(422);
  });
});

describe('one current word per person, changeable', () => {
  it('picking again replaces the word (still one row); taking it back deletes it', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    expect((await giveMarkTo(owner.handle, 'chill', as(friend))).status).toBe(201);
    expect((await giveMarkTo(owner.handle, 'pure', as(friend))).status).toBe(201); // a change, not a second word
    expect(await count()).toBe(1);
    expect((await marksOf(owner.handle, as(friend))).data.mine).toBe('pure');
    expect((await takeBackMark(owner.handle, as(friend))).data).toEqual({ removed: true });
    expect(await count()).toBe(0);
    expect((await marksOf(owner.handle, as(friend))).data.mine).toBeNull();
    expect((await takeBackMark(owner.handle, as(friend))).data).toEqual({ removed: false });
  });

  it('two racing picks leave exactly one row (the database allows one per pair)', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    const results = await Promise.all([
      giveMarkTo(owner.handle, 'chill', as(friend)),
      giveMarkTo(owner.handle, 'pure', as(friend)),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(await count()).toBe(1);
  });

  it('only a first pick rings their bell, and never says which word; changing it rings nothing', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    await giveMarkTo(owner.handle, 'chill', as(friend));
    await giveMarkTo(owner.handle, 'bold', as(friend));
    await flushBackground();
    const rows = (
      await q("select count(*)::int n from notifications where type = 'mark_given' and recipient_id = $1", [
        await userId(owner.handle),
      ])
    ).rows[0].n as number;
    expect(rows).toBe(1);
  });
});

describe('how a profile is described: words only, never counts or who', () => {
  it('nothing until three people have picked; then the top two words, most first, with no numbers or names', async () => {
    const owner = await person('owner');
    const a = await person('alpha');
    const b = await person('bravo');
    const c = await person('charlie');
    const stranger = await person('stranger');
    await open(owner);
    for (const p of [a, b, c]) await posse(owner, p);
    await giveMarkTo(owner.handle, 'chill', as(a));
    await giveMarkTo(owner.handle, 'chill', as(b));
    expect((await marksOf(owner.handle, as(stranger))).data.words).toEqual([]); // two people are not enough
    await giveMarkTo(owner.handle, 'sharp', as(c));
    const seen = await marksOf(owner.handle, as(stranger));
    expect(seen.data.words).toEqual(['chill', 'sharp']);
    expect(Object.keys(seen.data).sort()).toEqual(['canGive', 'isOwner', 'mine', 'words']); // no counts at all
    for (const p of [a, b, c]) expect(seen.text).not.toContain(p.handle);
    expect(seen.text).not.toMatch(/raterId|rater_id|count|total/);
  });

  it('my own pick is shown only to me, and canGive reflects the viewer (never the owner)', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const other = await person('other');
    await open(owner);
    await posse(owner, friend);
    await posse(owner, other);
    expect((await marksOf(owner.handle, as(owner))).data.canGive).toBe(false);
    expect((await marksOf(owner.handle, as(friend))).data.canGive).toBe(true);
    await giveMarkTo(owner.handle, 'gem', as(friend));
    expect((await marksOf(owner.handle, as(friend))).data).toMatchObject({ mine: 'gem', canGive: true });
    expect((await marksOf(owner.handle, as(other))).data.mine).toBeNull();
    expect((await marksOf(owner.handle, as(owner))).data.mine).toBeNull();
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
  it('picking words is capped per person, across people', async () => {
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
  it('refuses a self-pick, an unknown word, and a second row for the same pair', async () => {
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
    await q("insert into marks (rater_id, target_id, kind, from_pal) values ($1, $2, 'sharp', true)", [f, o]);
    await expect(
      q("insert into marks (rater_id, target_id, kind, from_pal) values ($1, $2, 'gem', true)", [f, o]),
    ).rejects.toThrow(/marks_one_per_pair_idx/);
  });

  it('deleting either person removes their words', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    await giveMarkTo(owner.handle, 'chill', as(friend));
    await q('delete from users where handle = $1', [friend.handle]);
    expect(await count()).toBe(0);
  });
});
