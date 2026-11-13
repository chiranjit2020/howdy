import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildDataExport } from '@/app/_lib/data-export';
import { getAsk, purgeStaleHeldAsks } from '@/modules/asks';
import { AUTO_HOLD_REPORTERS } from '@/modules/moderation/anti-spam';
import { getPool } from '@/platform/db';
import { nameFromHandle } from '@/shared/names';
import {
  answer,
  askPublic,
  decide,
  listAsks,
  note,
  removeAsk,
  reportAsk,
  type PublicAsk,
} from '../helpers/asks';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { chimesOf } from '../helpers/chimes';
import { createAsk } from '../helpers/hall-feed';
import { actOnReport, makeRole, queue, type QueueItem } from '../helpers/moderation';
import { doAct, q, report, userId } from '../helpers/social';
import { act, create } from '../helpers/town-halls';

/**
 * Public "Buy or wait?" (ADR-066): asked to my friends or to everyone on Howdy. Who may see one is decided when it is
 * read; anyone who may not gets the same 404 as a question that is not there.
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
async function befriend(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
const Q = {
  item: 'Air fryer',
  price: 6499,
  why: 'I cook every evening and want fewer oily dishes.',
  alternative: 'Keep using the kadhai',
};
const ask = async (who: P, audience: 'friends' | 'everyone', extra: Record<string, unknown> = {}) => {
  const r = await askPublic({ ...Q, audience, ...extra }, as(who));
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  return r.data.ask as PublicAsk;
};
const listed = async (who: P, query = '') =>
  ((await listAsks(as(who), query)).data.asks ?? []).map((a) => a.id);

describe('who sees what', () => {
  it('"everyone": any signed-in person, and signed out by its link; "friends": friends only', async () => {
    const ann = await person('ann');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await befriend(ann, friend);
    const open = await ask(ann, 'everyone');
    const close = await ask(ann, 'friends');

    expect(await listed(stranger)).toEqual([open.id]);
    expect(await listed(friend)).toEqual([close.id, open.id]);
    expect(await listed(friend, '?show=friends')).toEqual([close.id, open.id]);
    expect(await listed(stranger, '?show=friends')).toEqual([]);
    expect(await listed(ann, '?show=mine')).toEqual([close.id, open.id]);

    // Signed out (the share link): the everyone question only, and nobody's answer box.
    expect(await getAsk(null, open.id, 'ip-1')).toMatchObject({ item: Q.item, canAnswer: false });
    expect(await getAsk(null, close.id, 'ip-1')).toBeNull();

    // A stranger cannot answer (or even find) a friends-only question.
    expect((await answer(close.id, { verdict: 'buy', reason: 'Do it' }, as(stranger))).status).toBe(404);
    expect((await answer(close.id, { verdict: 'buy', reason: 'Do it' }, as(friend))).status).toBe(200);
  });

  it('stopping being friends, or a block either way, hides it', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    const cat = await person('cat');
    await befriend(ann, bob);
    const close = await ask(ann, 'friends');
    const open = await ask(ann, 'everyone');
    await doAct(ann.handle, 'leave', as(bob));
    expect(await listed(bob)).toEqual([open.id]);
    await doAct(ann.handle, 'block', as(cat));
    expect(await listed(cat)).toEqual([]);
    expect((await answer(open.id, { verdict: 'wait', reason: 'No' }, as(cat))).status).toBe(404);
    expect(close.id).toBeTruthy();
  });

  it('refuses links and a missing reason, and an unknown audience', async () => {
    const ann = await person('ann');
    for (const bad of [
      { ...Q, audience: 'everyone', why: 'buy it at example.com' },
      { ...Q, audience: 'everyone', why: '' },
      { ...Q, audience: 'world' },
    ]) {
      expect((await askPublic(bad, as(ann))).status, JSON.stringify(bad)).toBe(422);
    }
  });
});

describe('answering and deciding', () => {
  it('a reason is required, names show, the asker gets one update and decides, which closes answers', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    const made = await ask(ann, 'everyone');
    expect((await answer(made.id, { verdict: 'wait' }, as(bob))).status).toBe(422);
    expect((await answer(made.id, { verdict: 'buy', reason: 'Me first' }, as(ann))).status).toBe(400);
    const r = await answer(made.id, { verdict: 'wait', reason: 'Sale next week' }, as(bob));
    expect(r.data.ask).toMatchObject({ counts: { buy: 0, wait: 1 }, mine: { verdict: 'wait' } });
    expect(r.data.ask!.answers.map((a) => a.author.handle)).toEqual([bob.handle]);

    expect((await note(made.id, 'Fair point', as(bob))).status).toBe(404);
    expect((await note(made.id, 'Fair point', as(ann))).status).toBe(200);
    expect((await note(made.id, 'Again', as(ann))).status).toBe(409);
    expect((await decide(made.id, 'waiting', as(bob))).status).toBe(404);
    expect((await decide(made.id, 'waiting', as(ann))).data.ask!.outcome).toBe('waiting');
    expect((await answer(made.id, { verdict: 'buy', reason: 'Changed my mind' }, as(bob))).status).toBe(400);
  });

  it('three a day, shared with group questions', async () => {
    const ann = await person('ann');
    const hallId = (
      await create({ name: 'Flatmates', description: 'Rent and gossip.', visibility: 'open' }, as(ann))
    ).data.townHall!.id as string;
    expect((await createAsk(hallId, Q, as(ann))).status).toBe(201);
    await ask(ann, 'everyone');
    await ask(ann, 'friends');
    expect((await askPublic({ ...Q, audience: 'everyone' }, as(ann))).status).toBe(429);
    expect((await createAsk(hallId, Q, as(ann))).status).toBe(429);
    expect(act).toBeTruthy();
  });
});

describe('notifications', () => {
  it('a new question rings friends (not strangers); a first answer rings the asker; they go when hidden', async () => {
    const ann = await person('ann');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await befriend(ann, friend);
    const made = await ask(ann, 'everyone');
    const forFriend = (await chimesOf(as(friend))).data.chimes!.filter((c) => c.type === 'ask_created');
    expect(forFriend.map((c) => [c.text, c.href])).toEqual([
      [`${nameFromHandle(ann.handle)} asks: buy it or wait?`, `/buy-or-wait/${made.id}`],
    ]);
    expect((await chimesOf(as(stranger))).data.chimes).toEqual([]);

    await answer(made.id, { verdict: 'buy', reason: 'Yes' }, as(stranger));
    await answer(made.id, { verdict: 'wait', reason: 'Hmm' }, as(stranger)); // a change rings nothing
    const anns = (await chimesOf(as(ann))).data.chimes!.filter((c) => c.type === 'ask_answered');
    expect(anns).toHaveLength(1);
    // Ann blocks the stranger: that Chime is gone at read time.
    await doAct(stranger.handle, 'block', as(ann));
    expect((await chimesOf(as(ann))).data.chimes!.filter((c) => c.type === 'ask_answered')).toEqual([]);
  });
});

describe('safety', () => {
  it('a flagged question goes to moderators with its words, and they can remove it', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    const mod = await person('mod');
    await makeRole(mod.handle, 'moderator');
    const made = await ask(ann, 'everyone', { why: 'Something rude here' });
    expect((await reportAsk(made.id, { reason: 'harassment' }, as(ann))).status).toBe(404); // not your own
    expect((await reportAsk(made.id, { reason: 'harassment' }, as(bob))).status).toBe(202);
    const item = ((await queue(as(mod))).data.reports as QueueItem[])[0]!;
    expect(item).toMatchObject({ subject: 'ask', canRemove: true });
    expect(item.evidenceText).toContain('Something rude here');
    expect((await actOnReport(item.id, { action: 'remove_hall_post' }, as(mod))).status).toBe(400);
    expect((await actOnReport(item.id, { action: 'remove_ask' }, as(mod))).status).toBe(200);
    expect(await listed(bob)).toEqual([]);
  });

  it('a held asker sees their question as asked; nobody else does, nobody is rung, and it goes after 30 days', async () => {
    const ann = await person('ann');
    const friend = await person('friend');
    await befriend(ann, friend);
    for (let i = 0; i < AUTO_HOLD_REPORTERS; i++) {
      const r = await person(`rep${i}`);
      await report({ handle: ann.handle, reason: 'spam' }, as(r));
    }
    const made = await ask(ann, 'everyone');
    expect(await listed(ann, '?show=mine')).toEqual([made.id]);
    expect(await listed(friend)).toEqual([]);
    expect((await chimesOf(as(friend))).data.chimes!.filter((c) => c.type === 'ask_created')).toEqual([]);
    await q("update asks set created_at = now() - interval '31 days'");
    expect(await purgeStaleHeldAsks()).toBe(1);
  });

  it('the asker takes it down (answers go too); anyone else gets a 404', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    const made = await ask(ann, 'everyone');
    await answer(made.id, { verdict: 'buy', reason: 'Go' }, as(bob));
    expect((await removeAsk(made.id, as(bob))).status).toBe(404);
    expect((await removeAsk(made.id, as(ann))).status).toBe(200);
    for (const t of ['asks', 'ask_answers'])
      expect((await q(`select count(*)::int n from ${t}`)).rows[0].n, t).toBe(0);
  });

  it('"Download my data" includes my questions and my answers', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    const made = await ask(ann, 'everyone');
    await answer(made.id, { verdict: 'wait', reason: 'Sale soon' }, as(bob));
    const annData = (await buildDataExport(await userId(ann.handle))).data as {
      buyOrWait: { myQuestions: { item: string }[] };
    };
    expect(annData.buyOrWait.myQuestions.map((x) => x.item)).toEqual([Q.item]);
    const bobData = (await buildDataExport(await userId(bob.handle))).data as {
      buyOrWait: { myAnswers: { answer: string; reason: string }[] };
    };
    expect(bobData.buyOrWait.myAnswers).toEqual([
      expect.objectContaining({ answer: 'wait', reason: 'Sale soon' }),
    ]);
  });
});
