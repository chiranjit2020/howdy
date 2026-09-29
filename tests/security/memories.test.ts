import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { memoriesToday } from '@/modules/memories';
import { getPool } from '@/platform/db';
import { addDays, addYears, dayOf } from '@/shared/calendar';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { nail } from '../helpers/fence';
import { doAct, q, userId } from '../helpers/social';

/** ADR-028: Memories — on this day in earlier years, only what is still there and still visible to me. */

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
const today = dayOf(new Date());
/** Noon in India on `day` (unambiguously that day in Howdy's calendar). */
const noon = (day: string) => `${day}T12:00:00+05:30`;
const yearsAgo = (n: number) => noon(addYears(today, -n));

async function openFence(p: P) {
  await q(
    "update profiles set fence_posting = 'members' where user_id = (select id from users where handle = $1)",
    [p.handle],
  );
}
async function cardOn(owner: P, author: P, body: string, at: string) {
  const r = await nail(owner.handle, { body }, as(author));
  expect(r.status).toBe(201);
  await q('update post_cards set created_at = $2 where id = $1', [r.data.card!.id, at]);
  return r.data.card!.id;
}
/** `a` and `b` become Pals, and their link (only this pair's row) says it happened at `since`. */
async function pals(a: P, b: P, since: string) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
  await q(
    `update posse_links set responded_at = $3
     where user_low = least($1::uuid, $2::uuid) and user_high = greatest($1::uuid, $2::uuid)`,
    [await userId(a.handle), await userId(b.handle), since],
  );
}
const mem = async (p: P) => memoriesToday(await userId(p.handle));

describe('on this day: cards on my Fence', () => {
  it('shows cards from this day in earlier years, with how long ago; not today, not other days', async () => {
    const me = await person('me');
    await cardOn(me, me, 'one year', yearsAgo(1));
    await cardOn(me, me, 'three years', yearsAgo(3));
    await cardOn(me, me, 'just now', noon(today));
    await cardOn(me, me, 'yesterday last year', noon(addDays(addYears(today, -1), -1)));
    const m = await mem(me);
    expect(m.cards.map((c) => [c.body, c.yearsAgo])).toEqual([
      ['one year', 1],
      ['three years', 3],
    ]);
  });

  it('uses the Indian calendar: 20:00 UTC counts as the next day', async () => {
    const me = await person('me');
    // 20:00 UTC on the day before = 01:30 IST on this day, last year
    await cardOn(me, me, 'late night', `${addDays(addYears(today, -1), -1)}T20:00:00Z`);
    expect((await mem(me)).cards.map((c) => c.body)).toEqual(['late night']);
  });

  it('only what I can still see: not from someone I blocked or muted, or who is suspended; not removed cards', async () => {
    const me = await person('me');
    await openFence(me);
    const blocked = await person('blocked');
    const muted = await person('muted');
    const gone = await person('gone');
    const fine = await person('fine');
    for (const p of [blocked, muted, gone, fine]) await cardOn(me, p, `from ${p.handle}`, yearsAgo(1));
    const removed = await cardOn(me, me, 'removed', yearsAgo(1));
    await doAct(blocked.handle, 'block', as(me));
    await doAct(muted.handle, 'mute', as(me));
    await q("update users set status = 'suspended' where handle = $1", [gone.handle]);
    await q('delete from post_cards where id = $1', [removed]);
    expect((await mem(me)).cards.map((c) => c.body)).toEqual([`from ${fine.handle}`]);
  });

  it('only my own Fence', async () => {
    const me = await person('me');
    const other = await person('other');
    await cardOn(other, other, 'theirs', yearsAgo(1));
    expect((await mem(me)).cards).toEqual([]);
  });
});

describe('Pal anniversaries', () => {
  it('the day we became Pals, a year or more ago — only while we still are', async () => {
    const me = await person('me');
    const pal = await person('pal');
    const ex = await person('expal');
    await pals(me, pal, yearsAgo(2));
    await pals(me, ex, yearsAgo(1));
    await doAct(ex.handle, 'leave', as(me));
    const m = await mem(me);
    expect(m.pals.map((p) => [p.pal.handle, p.years])).toEqual([[pal.handle, 2]]);
    // and the other side sees it too
    expect((await mem(pal)).pals.map((p) => p.pal.handle)).toEqual([me.handle]);
  });

  it('not on the day we became Pals this year', async () => {
    const me = await person('me');
    const pal = await person('pal');
    await pals(me, pal, noon(today));
    expect((await mem(me)).pals).toEqual([]);
  });
});

describe('Tribute anniversaries', () => {
  it('a published Tribute written to me on this day; not a pending one, not one taken down', async () => {
    const me = await person('me');
    const pal = await person('pal');
    const meId = await userId(me.handle);
    const palId = await userId(pal.handle);
    await q(
      `insert into tributes (owner_id, author_id, body, status, created_at) values
       ($1, $2, 'kind words', 'published', $3), ($1, $2, 'still waiting', 'pending', $3)`,
      [meId, palId, yearsAgo(1)],
    );
    const m = await mem(me);
    expect(m.tributes.map((t) => [t.body, t.author.handle, t.yearsAgo])).toEqual([
      ['kind words', pal.handle, 1],
    ]);
    await q("delete from tributes where body = 'kind words'");
    expect((await mem(me)).tributes).toEqual([]);
  });
});
