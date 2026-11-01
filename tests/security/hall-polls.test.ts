import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { townHallsExport } from '@/modules/town-halls';
import { getPool } from '@/platform/db';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { closePoll, createPoll, feed, post, removePost, vote, type HallPost } from '../helpers/hall-feed';
import { q, userId } from '../helpers/social';
import { act, create, memberAction } from '../helpers/town-halls';

/**
 * Polls in a group (ADR-057): any member asks one, with two to four options; members vote once, may change or take back;
 * everyone sees the counts, nobody — not even the asker — sees who voted for what. Closing gives final results.
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
const ask = async (hallId: string, who: P, options = ['14 Dec', '21 Dec', '28 Dec']) => {
  const r = await createPoll(hallId, { question: 'Which date for the reunion?', options }, as(who));
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  return r.data.post as HallPost;
};
const seen = async (hallId: string, who: P, postId: string) =>
  (await feed(hallId, as(who))).data.posts!.find((p) => p.id === postId)!.poll!;

describe('asking a poll', () => {
  it('any member asks one: its words are the question, its options in order, no votes yet', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await ask(id, ann, ['14 Dec', '', '21 Dec']); // a blank box is dropped
    expect(made.body).toBe('Which date for the reunion?');
    expect(made.poll).toMatchObject({ total: 0, mine: null, closed: false, canClose: true });
    expect(made.poll!.options.map((o) => o.label)).toEqual(['14 Dec', '21 Dec']);
  });

  it('refuses one option, five, duplicates, a short question and links', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    for (const bad of [
      { question: 'Which date?', options: ['Only one'] },
      { question: 'Which date?', options: ['a', 'b', 'c', 'd', 'e'] },
      { question: 'Which date?', options: ['Sunday', 'sunday'] },
      { question: 'Hm', options: ['Yes', 'No'] },
      { question: 'Which date?', options: ['Yes', 'see example.com'] },
    ]) {
      expect((await createPoll(id, bad, as(owner))).status, JSON.stringify(bad)).toBe(422);
    }
    expect((await q('select count(*)::int n from town_hall_polls')).rows[0].n).toBe(0);
  });

  it('a non-member can neither ask one nor vote (the same 404 as a missing group or post)', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    const id = await hall(owner);
    expect(
      (await createPoll(id, { question: 'Gatecrash?', options: ['Yes', 'No'] }, as(stranger))).status,
    ).toBe(404);
    const made = await ask(id, owner);
    expect((await vote(made.id, made.poll!.options[0]!.id, as(stranger))).status).toBe(404);
  });
});

describe('voting', () => {
  it('members vote, change and take back; everyone sees counts, and nothing anywhere says who voted for what', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const made = await ask(id, owner);
    const [dec14, dec21] = made.poll!.options;
    expect((await vote(made.id, dec14!.id, as(ann))).status).toBe(200);
    expect((await vote(made.id, dec14!.id, as(bob))).status).toBe(200);
    expect((await vote(made.id, dec21!.id, as(bob))).status).toBe(200); // changed
    const forAnn = await seen(id, ann, made.id);
    expect(forAnn.options.map((o) => o.votes)).toEqual([1, 1, 0]);
    expect(forAnn).toMatchObject({ total: 2, mine: dec14!.id });
    // The asker sees counts only, and the page carries no voter names.
    const page = await feed(id, as(owner));
    expect(page.text).not.toContain(ann.handle);
    expect(page.text).not.toContain(bob.handle);
    expect((await vote(made.id, null, as(ann))).status).toBe(200);
    expect((await seen(id, ann, made.id)).total).toBe(1);
  });

  it('an option from another poll, or a post that is not a poll, gets a 404', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const first = await ask(id, owner);
    const second = await ask(id, owner, ['Yes', 'No']);
    expect((await vote(first.id, second.poll!.options[0]!.id, as(ann))).status).toBe(404);
    const plain = (await post(id, { body: 'Just a post' }, as(owner))).data.post!.id;
    expect((await vote(plain, first.poll!.options[0]!.id, as(ann))).status).toBe(404);
    expect((await q('select count(*)::int n from town_hall_poll_votes')).rows[0].n).toBe(0);
  });

  it('only current members count: someone who leaves stops counting', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await ask(id, owner);
    await vote(made.id, made.poll!.options[0]!.id, as(ann));
    expect((await seen(id, owner, made.id)).total).toBe(1);
    await act(id, 'leave', as(ann));
    expect((await seen(id, owner, made.id)).total).toBe(0);
  });
});

describe('closing', () => {
  it('the asker closes it: final results, no more votes; a member who did not ask cannot (404)', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const made = await ask(id, ann);
    await vote(made.id, made.poll!.options[0]!.id, as(bob));
    expect((await seen(id, bob, made.id)).canClose).toBe(false);
    expect((await closePoll(made.id, as(bob))).status).toBe(404);
    expect((await closePoll(made.id, as(ann))).status).toBe(200);
    expect((await closePoll(made.id, as(ann))).status).toBe(200); // a harmless repeat
    const after = await seen(id, bob, made.id);
    expect(after).toMatchObject({ closed: true, total: 1 });
    expect((await vote(made.id, made.poll!.options[1]!.id, as(bob))).status).toBe(400);
  });

  it('the owner or a Deputy may close anyone’s poll', async () => {
    const owner = await person('owner');
    const dep = await person('dep');
    const ann = await person('ann');
    const id = await hall(owner, [dep, ann]);
    await memberAction(id, dep.handle, 'make_deputy', as(owner));
    const made = await ask(id, ann);
    expect((await seen(id, dep, made.id)).canClose).toBe(true);
    expect((await closePoll(made.id, as(dep))).status).toBe(200);
  });
});

describe('what goes with it', () => {
  it('taking the post down takes the poll, its options and votes', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await ask(id, owner);
    await vote(made.id, made.poll!.options[0]!.id, as(ann));
    expect((await removePost(made.id, as(owner))).status).toBe(200);
    for (const t of ['town_hall_polls', 'town_hall_poll_options', 'town_hall_poll_votes'])
      expect((await q(`select count(*)::int n from ${t}`)).rows[0].n, t).toBe(0);
  });

  it('"Download my data" includes my polls and my own votes', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await ask(id, owner);
    await vote(made.id, made.poll!.options[1]!.id, as(ann));
    const mine = await townHallsExport(await userId(owner.handle));
    expect(mine[0]!.posts[0]!.pollOptions).toEqual(['14 Dec', '21 Dec', '28 Dec']);
    const anns = await townHallsExport(await userId(ann.handle));
    expect(anns[0]!.pollVotes).toEqual([
      expect.objectContaining({ question: 'Which date for the reunion?', option: '21 Dec' }),
    ]);
  });
});
