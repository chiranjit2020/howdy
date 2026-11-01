import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/platform/db';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { feed, pin, post, removePost, unpin } from '../helpers/hall-feed';
import { doAct, q } from '../helpers/social';
import { act, create, memberAction } from '../helpers/town-halls';

/**
 * A pinned notice (ADR-055): the owner or a Deputy pins one published post to the top of a group's feed. Nobody else
 * can, nobody can tell a post they may not pin from one that is not there, and the pinned post obeys every rule any post
 * in the list does.
 */

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

async function hall(owner: P, members: P[] = []): Promise<string> {
  const id = (
    await create(
      { name: 'Batch of 2019', description: 'Reunions and old jokes.', visibility: 'open' },
      as(owner),
    )
  ).data.townHall!.id as string;
  for (const m of members) expect((await act(id, 'join', as(m))).status).toBe(200);
  return id;
}
const say = async (hallId: string, who: P, body: string) =>
  (await post(hallId, { body }, as(who))).data.post!.id as string;

describe('pinning a notice', () => {
  it('the owner pins a post: it leads the feed for everyone, once, and only on the first page', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const notice = await say(id, owner, 'Reunion on 14 December, college canteen, 6 pm.');
    await say(id, ann, 'Count me in!');
    expect((await pin(notice, as(owner))).status).toBe(200);

    const seen = (await feed(id, as(ann))).data;
    expect(seen.pinned?.id).toBe(notice);
    expect(seen.posts!.map((p) => p.id)).not.toContain(notice);
    // A later page never carries it again.
    const later = (
      await feed(id, as(ann), '?limit=1&cursor=' + (await feed(id, as(ann), '?limit=1')).data.nextCursor)
    ).data;
    expect(later.pinned ?? null).toBeNull();
  });

  it('a Deputy may pin; an ordinary member may not, and gets the same 404 as a post that is not there', async () => {
    const owner = await person('owner');
    const dep = await person('dep');
    const ann = await person('ann');
    const id = await hall(owner, [dep, ann]);
    await memberAction(id, dep.handle, 'make_deputy', as(owner));
    const p = await say(id, ann, 'Lost my umbrella at the canteen.');
    expect((await pin(p, as(ann))).status).toBe(404);
    expect((await pin('00000000-0000-4000-8000-000000000000', as(ann))).status).toBe(404);
    expect((await feed(id, as(ann))).data.posts!.find((x) => x.id === p)?.canPin).toBe(false);
    expect((await pin(p, as(dep))).status).toBe(200);
    expect((await feed(id, as(owner))).data.pinned?.id).toBe(p);
  });

  it('a non-member cannot pin (404), and pinning one replaces the last', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    const id = await hall(owner);
    const first = await say(id, owner, 'First notice');
    const second = await say(id, owner, 'Second notice');
    expect((await pin(first, as(stranger))).status).toBe(404);
    await pin(first, as(owner));
    await pin(second, as(owner));
    const seen = (await feed(id, as(owner))).data;
    expect(seen.pinned?.id).toBe(second);
    expect(seen.posts!.map((p) => p.id)).toContain(first);
  });

  it('unpinning puts it back in its place; a stale unpin never removes a newer notice', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    const first = await say(id, owner, 'First notice');
    const second = await say(id, owner, 'Second notice');
    await pin(first, as(owner));
    await pin(second, as(owner));
    expect((await unpin(first, as(owner))).status).toBe(200); // not the pinned one: changes nothing
    expect((await feed(id, as(owner))).data.pinned?.id).toBe(second);
    await unpin(second, as(owner));
    const seen = (await feed(id, as(owner))).data;
    expect(seen.pinned ?? null).toBeNull();
    expect(seen.posts!.map((p) => p.id)).toEqual([second, first]);
  });

  it('a deleted post stops being pinned; a held post cannot be pinned', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const p = await say(id, owner, 'Short-lived notice');
    await pin(p, as(owner));
    await removePost(p, as(owner));
    expect((await feed(id, as(ann))).data.pinned ?? null).toBeNull();
    expect(
      (await q('select pinned_post_id from town_halls where id = $1', [id])).rows[0].pinned_post_id,
    ).toBeNull();
    const held = await say(id, ann, 'Waiting words');
    await q("update town_hall_posts set status = 'held' where id = $1", [held]);
    expect((await pin(held, as(owner))).status).toBe(404);
  });

  it('a pinned post by someone I muted is hidden from me, as anywhere in the feed', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const p = await say(id, owner, 'Notice from the owner');
    await pin(p, as(owner));
    await doAct(owner.handle, 'mute', as(ann));
    expect((await feed(id, as(ann))).data.pinned ?? null).toBeNull();
  });
});
