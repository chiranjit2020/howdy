import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { townHallsExport } from '@/modules/town-halls';
import { getPool } from '@/platform/db';
import { nameFromHandle } from '@/shared/names';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { chimesOf } from '../helpers/chimes';
import {
  answerAsk,
  createAsk,
  decideAsk,
  feed,
  noteAsk,
  removePost,
  type HallAsk,
  type HallPost,
} from '../helpers/hall-feed';
import { doAct, q, userId } from '../helpers/social';
import { act, create } from '../helpers/town-halls';

/**
 * "Buy or wait?" in a group (ADR-065): a member asks about something they want to buy; every other member is rung;
 * members answer Buy or Wait WITH a reason (names shown to members, as advice among friends); the asker adds one
 * update and decides, which closes answers.
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
      { name: 'Flatmates', description: 'Rent, groceries, gossip.', visibility: 'open' },
      as(owner),
    )
  ).data.townHall!.id as string;
  for (const m of members) expect((await act(id, 'join', as(m))).status).toBe(200);
  return id;
}
const QUESTION = {
  item: 'Noise-cancelling headphones',
  price: 12499,
  why: 'My commute is 90 minutes of traffic noise every day.',
  alternative: 'Keep my old earphones',
};
const ask = async (hallId: string, who: P, body: Record<string, unknown> = QUESTION) => {
  const r = await createAsk(hallId, body, as(who));
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  return r.data.post as HallPost;
};
const seen = async (hallId: string, who: P, postId: string): Promise<HallAsk> =>
  (await feed(hallId, as(who))).data.posts!.find((p) => p.id === postId)!.ask!;

describe('asking', () => {
  it('any member asks: the words are why, with item, price and alternative; no answers yet', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await ask(id, ann);
    expect(made.body).toBe(QUESTION.why);
    expect(made.ask).toMatchObject({
      item: QUESTION.item,
      priceRupees: 12499,
      alternative: QUESTION.alternative,
      note: null,
      outcome: null,
      counts: { buy: 0, wait: 0 },
      answers: [],
      canAnswer: false, // your own question
      isAsker: true,
    });
    expect((await seen(id, owner, made.id)).canAnswer).toBe(true);
  });

  it('refuses a missing price, a fraction, a huge price, a short item, no reason and links', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    for (const bad of [
      { ...QUESTION, price: 0 },
      { ...QUESTION, price: 99.5 },
      { ...QUESTION, price: 10_000_001 },
      { ...QUESTION, item: 'x' },
      { ...QUESTION, why: '' },
      { ...QUESTION, alternative: 'buy at example.com instead' },
    ]) {
      expect((await createAsk(id, bad, as(owner))).status, JSON.stringify(bad)).toBe(422);
    }
    expect((await q('select count(*)::int n from town_hall_asks')).rows[0].n).toBe(0);
  });

  it('a non-member can neither ask nor answer (the same 404 as a missing group or post)', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    const id = await hall(owner);
    expect((await createAsk(id, QUESTION, as(stranger))).status).toBe(404);
    const made = await ask(id, owner);
    expect((await answerAsk(made.id, { verdict: 'buy', reason: 'Go for it' }, as(stranger))).status).toBe(
      404,
    );
  });

  it('a person may ask only a few a day (it rings every member)', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    for (let i = 0; i < 3; i++) await ask(id, owner);
    expect((await createAsk(id, QUESTION, as(owner))).status).toBe(429);
  });
});

describe('answering', () => {
  it('a reason is required; members see who said what; change and take back', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const made = await ask(id, owner);
    expect((await answerAsk(made.id, { verdict: 'buy' }, as(ann))).status).toBe(422);
    expect((await answerAsk(made.id, { verdict: 'buy', reason: ' ' }, as(ann))).status).toBe(422);
    const r = await answerAsk(made.id, { verdict: 'buy', reason: 'You use it daily' }, as(ann));
    expect(r.status).toBe(200);
    expect(r.data.ask).toMatchObject({ counts: { buy: 1, wait: 0 }, mine: { verdict: 'buy' } });
    await answerAsk(made.id, { verdict: 'wait', reason: 'Diwali sale is close' }, as(bob));
    await answerAsk(made.id, { verdict: 'wait', reason: 'Actually, wait for the sale' }, as(ann)); // changed

    const forOwner = await seen(id, owner, made.id);
    expect(forOwner.counts).toEqual({ buy: 0, wait: 2 });
    // In the order last answered: Ann's change moves hers to the end.
    expect(forOwner.answers.map((a) => [a.author.handle, a.verdict, a.reason])).toEqual([
      [bob.handle, 'wait', 'Diwali sale is close'],
      [ann.handle, 'wait', 'Actually, wait for the sale'],
    ]);
    expect((await answerAsk(made.id, { verdict: null }, as(bob))).status).toBe(200);
    expect((await seen(id, ann, made.id)).counts).toEqual({ buy: 0, wait: 1 });
  });

  it('the asker cannot answer their own question', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    const made = await ask(id, owner);
    expect((await answerAsk(made.id, { verdict: 'buy', reason: 'Treat yourself' }, as(owner))).status).toBe(
      400,
    );
  });

  it('only current members count, and a member I blocked is left out of the names I see', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const made = await ask(id, owner);
    await answerAsk(made.id, { verdict: 'buy', reason: 'Worth it' }, as(ann));
    await answerAsk(made.id, { verdict: 'wait', reason: 'Not yet' }, as(bob));
    await doAct(bob.handle, 'block', as(owner));
    const afterBlock = await seen(id, owner, made.id);
    expect(afterBlock.answers.map((a) => a.author.handle)).toEqual([ann.handle]);
    await act(id, 'leave', as(ann));
    expect((await seen(id, owner, made.id)).answers).toEqual([]);
  });
});

describe('the asker: one update, then a decision', () => {
  it('one update only; deciding closes answers; others cannot do either (404)', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await ask(id, ann);
    expect((await noteAsk(made.id, 'It is for work calls too.', as(owner))).status).toBe(404);
    expect((await noteAsk(made.id, 'It is for work calls too.', as(ann))).status).toBe(200);
    expect((await noteAsk(made.id, 'And one more thing', as(ann))).status).toBe(409);
    expect((await decideAsk(made.id, 'bought', as(owner))).status).toBe(404);
    const d = await decideAsk(made.id, 'waiting', as(ann));
    expect(d.status).toBe(200);
    expect(d.data.ask).toMatchObject({ outcome: 'waiting', note: 'It is for work calls too.' });
    expect((await seen(id, owner, made.id)).canAnswer).toBe(false);
    expect((await answerAsk(made.id, { verdict: 'buy', reason: 'Do it' }, as(owner))).status).toBe(400);
    expect((await decideAsk(made.id, 'bought', as(ann))).data.ask!.outcome).toBe('bought'); // may change it
  });
});

describe('notifications', () => {
  it('a new question rings every other member; a first answer rings the asker (a changed one does not)', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const made = await ask(id, ann);
    for (const who of [owner, bob]) {
      const chimes = (await chimesOf(as(who))).data.chimes!;
      expect(chimes.map((c) => [c.type, c.text, c.href])).toEqual([
        [
          'hall_ask_created',
          `${nameFromHandle(ann.handle)} asks your group: buy it or wait?`,
          `/groups/${id}`,
        ],
      ]);
    }
    expect((await chimesOf(as(ann))).data.chimes).toEqual([]);

    await answerAsk(made.id, { verdict: 'buy', reason: 'Yes' }, as(bob));
    await answerAsk(made.id, { verdict: 'wait', reason: 'Hmm, no' }, as(bob));
    const anns = (await chimesOf(as(ann))).data.chimes!;
    expect(anns.map((c) => c.type)).toEqual(['hall_ask_answered']);
  });
});

describe('what goes with it', () => {
  it('taking the post down takes the question and its answers', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await ask(id, owner);
    await answerAsk(made.id, { verdict: 'buy', reason: 'Go' }, as(ann));
    expect((await removePost(made.id, as(owner))).status).toBe(200);
    for (const t of ['town_hall_asks', 'town_hall_ask_answers'])
      expect((await q(`select count(*)::int n from ${t}`)).rows[0].n, t).toBe(0);
  });

  it('"Download my data" includes my questions and my answers', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await ask(id, owner);
    await answerAsk(made.id, { verdict: 'wait', reason: 'Sale soon' }, as(ann));
    const mine = await townHallsExport(await userId(owner.handle));
    expect(mine[0]!.posts[0]!.ask).toMatchObject({ item: QUESTION.item, priceRupees: 12499 });
    const anns = await townHallsExport(await userId(ann.handle));
    expect(anns[0]!.askAnswers).toEqual([
      expect.objectContaining({ item: QUESTION.item, verdict: 'wait', reason: 'Sale soon' }),
    ]);
  });
});
