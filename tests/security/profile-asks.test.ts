import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { asksBy } from '@/modules/asks';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { askPublic, type PublicAsk } from '../helpers/asks';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { doAct, q, userId } from '../helpers/social';

/** A person's questions on their profile wall: each viewer sees exactly the ones they may see anywhere else. */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
  setRateLimiter({ consume: async () => ({ allowed: true, remaining: 999, retryAfterSec: 0 }) });
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof settledUser>>;
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const ask = async (p: P, audience: 'friends' | 'everyone', item: string) => {
  const r = await askPublic({ item, price: 999, why: 'Thinking about it for a while.', audience }, as(p));
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  return r.data.ask as PublicAsk;
};
const items = async (viewer: P | null, author: P) =>
  (await asksBy(viewer ? await userId(viewer.handle) : null, await userId(author.handle), 'test')).map(
    (a) => a.item,
  );

describe('questions on a profile wall', () => {
  it('owner: all, held too; friend: friends + everyone; stranger and signed out: everyone only', async () => {
    const ann = await person('ann');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await doAct(friend.handle, 'request', as(ann));
    await doAct(ann.handle, 'accept', as(friend));
    await ask(ann, 'everyone', 'Phone');
    await ask(ann, 'friends', 'Shoes');
    const held = await ask(ann, 'everyone', 'Bike');
    await q("update asks set status = 'held' where id = $1", [held.id]);

    expect(await items(ann, ann)).toEqual(['Bike', 'Shoes', 'Phone']);
    expect(await items(friend, ann)).toEqual(['Shoes', 'Phone']);
    expect(await items(stranger, ann)).toEqual(['Phone']);
    expect(await items(null, ann)).toEqual(['Phone']);
  });

  it('blocked either way: nothing; newest three only', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    for (const item of ['One', 'Two', 'Three', 'Four']) await ask(ann, 'everyone', item);
    expect(await items(bob, ann)).toEqual(['Four', 'Three', 'Two']);
    await doAct(bob.handle, 'block', as(ann));
    expect(await items(bob, ann)).toEqual([]);
  });
});
