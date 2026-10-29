import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as feedRoute } from '@/app/api/feed/route';
import { getPool } from '@/platform/db';
import { call, freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { fenceOf, nail } from '../helpers/fence';
import { patchRanch } from '../helpers/ranch';
import { doAct } from '../helpers/social';

/**
 * Home's feed (the newest posts on your friends' walls and your own) must never show more than those walls' own pages
 * would: each wall is admitted by the same canFence rule, and within it the same people are hidden.
 */
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

async function friends(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

interface FeedCard {
  body: string;
  author: { handle: string };
  wall: { handle: string };
}
const feed = async (p: P, query = '') => {
  const r = await call(feedRoute, 'GET', `/api/feed${query}`, undefined, as(p));
  return {
    status: r.status,
    cards: (r.data.cards ?? []) as FeedCard[],
    next: r.data.nextCursor as string | null,
  };
};
const bodies = async (p: P) => (await feed(p)).cards.map((c) => c.body);

async function post(author: P, wallOwner: P, body: string) {
  const r = await nail(wallOwner.handle, { body }, as(author));
  expect(r.status, `nail ${body}`).toBe(201);
}

describe("Home's feed", () => {
  it('shows posts on my friends’ walls and my own, newest first, with whose wall each is on', async () => {
    const me = await person('me');
    const ann = await person('ann');
    const bob = await person('bob');
    await friends(me, ann);
    await friends(ann, bob);
    await post(ann, ann, 'Ann on her own wall');
    await post(bob, ann, 'Bob on Ann’s wall');
    await post(me, me, 'Me on mine');

    const f = await feed(me);
    expect(f.status).toBe(200);
    expect(f.cards.map((c) => c.body)).toEqual(['Me on mine', 'Bob on Ann’s wall', 'Ann on her own wall']);
    const onAnns = f.cards.find((c) => c.body === 'Bob on Ann’s wall')!;
    expect(onAnns.author.handle).toBe(bob.handle);
    expect(onAnns.wall.handle).toBe(ann.handle);
  });

  it('never shows the walls of people I am not friends with', async () => {
    const me = await person('me');
    const ann = await person('ann');
    const stranger = await person('stranger');
    await friends(ann, stranger); // a friend of a friend is not my friend
    await post(stranger, stranger, 'Stranger’s own words');
    // The stranger's wall is readable by members by default: the feed still leaves it out, it is not a friend's.
    expect((await fenceOf(stranger.handle, as(me))).status).toBe(200);
    expect(await bodies(me)).not.toContain('Stranger’s own words');
  });

  it('a friend’s wall I may not read is left out, exactly as its own page would refuse me', async () => {
    const me = await person('me');
    const ann = await person('ann');
    await friends(me, ann);
    await post(ann, ann, 'Ann’s words');
    expect(await bodies(me)).toContain('Ann’s words');
    // Ann blocks me: her wall's own page refuses me, and so does the feed.
    await doAct(me.handle, 'block', as(ann));
    expect((await fenceOf(ann.handle, as(me))).status).toBe(404);
    expect(await bodies(me)).not.toContain('Ann’s words');
  });

  it('hides people I muted, on any wall, just like a wall page does', async () => {
    const me = await person('me');
    const ann = await person('ann');
    const bob = await person('bob');
    await friends(me, ann);
    await friends(ann, bob);
    await post(bob, ann, 'Bob is loud');
    await post(ann, ann, 'Ann is fine');
    await doAct(bob.handle, 'mute', as(me));
    const shown = await bodies(me);
    expect(shown).toContain('Ann is fine');
    expect(shown).not.toContain('Bob is loud');
  });

  it('never shows waiting posts, not even to the wall’s owner or their writer', async () => {
    const me = await person('me');
    const ann = await person('ann');
    await friends(me, ann);
    await patchRanch({ fenceReview: true }, as(ann));
    await post(me, ann, 'Waiting for Ann');
    expect(await bodies(me)).not.toContain('Waiting for Ann'); // the writer
    expect(await bodies(ann)).not.toContain('Waiting for Ann'); // the owner
  });

  it('pages with an opaque cursor, without repeats, and refuses a forged one', async () => {
    const me = await person('me');
    const ann = await person('ann');
    await friends(me, ann);
    for (let i = 0; i < 5; i++) await post(ann, ann, `post ${i}`);
    const first = await feed(me, '?limit=2');
    expect(first.cards.map((c) => c.body)).toEqual(['post 4', 'post 3']);
    const second = await feed(me, `?limit=2&cursor=${first.next}`);
    expect(second.cards.map((c) => c.body)).toEqual(['post 2', 'post 1']);
    expect((await feed(me, '?cursor=not-a-real-cursor')).status).toBe(400);
  });

  it('is for signed-in people only', async () => {
    const r = await call(feedRoute, 'GET', '/api/feed');
    expect(r.status).toBe(401);
  });
});
