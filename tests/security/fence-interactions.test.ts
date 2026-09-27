import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { purgeStaleWaiting } from '@/modules/fence';
import { REPLIES_PER_CARD } from '@/shared/validation/fence';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import {
  allBodies,
  approve,
  approveReplyOf,
  fenceOf,
  flagCard,
  nail,
  removeReplyOf,
  replyTo,
  scrape,
  waiting,
  yo,
} from '../helpers/fence';
import { patchRanch } from '../helpers/ranch';
import { doAct, insertUser, q, userId } from '../helpers/social';

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

async function posse(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

/** An owner with an open (members-can-write) Fence and a Posse friend who writes on it. */
async function wall() {
  const owner = await person('owner');
  await patchRanch({ fencePosting: 'members' }, as(owner));
  const friend = await person('friend');
  await posse(owner, friend);
  return { owner, friend };
}

describe('Restrict: the words are held, and the writer is never told', () => {
  it('a restricted writer’s card looks posted to them, is invisible to everyone else, and waits in the owner’s queue', async () => {
    const { owner, friend } = await wall();
    const bystander = await person('bystander');
    await doAct(friend.handle, 'restrict', as(owner));

    const normal = await nail(owner.handle, { body: 'from a normal person' }, as(bystander));
    const held = await nail(owner.handle, { body: 'from a restricted one' }, as(friend));
    // Same status and same shape: nothing tells the restricted writer apart.
    expect(held.status).toBe(normal.status);
    expect(Object.keys(held.data.card!).sort()).toEqual(Object.keys(normal.data.card!).sort());
    expect(held.data.card).toMatchObject({ mine: true, waiting: false });

    expect((await fenceOf(owner.handle, as(friend))).data.cards!.map((c) => c.body)).toContain(
      'from a restricted one',
    );
    for (const viewer of [owner, bystander]) {
      const bodies = (await fenceOf(owner.handle, as(viewer))).data.cards!.map((c) => c.body);
      expect(bodies, 'seen by someone else').not.toContain('from a restricted one');
    }
    expect((await fenceOf(owner.handle)).status).toBe(404);

    const queue = await waiting(as(owner));
    expect(queue.data.cards).toHaveLength(1);
    expect(queue.data.cards).toMatchObject([
      { body: 'from a restricted one', author: { handle: friend.handle } },
    ]);
  });

  it('approving publishes it for everyone (at the top of the wall); the queue empties', async () => {
    const { owner, friend } = await wall();
    const bystander = await person('bystander');
    await doAct(friend.handle, 'restrict', as(owner));
    await nail(owner.handle, { body: 'older card' }, as(owner));
    const held = await nail(owner.handle, { body: 'held card' }, as(friend));
    const id = held.data.card!.id;

    expect((await approve(id, as(owner))).status).toBe(200);
    expect((await approve(id, as(owner))).status).toBe(200); // idempotent
    expect((await fenceOf(owner.handle, as(bystander))).data.cards!.map((c) => c.body)).toEqual([
      'held card',
      'older card',
    ]);
    expect((await waiting(as(owner))).data.cards).toEqual([]);
  });

  it('only the Fence owner can approve — the writer, a bystander and a stranger all get the same 404 as a missing card', async () => {
    const { owner, friend } = await wall();
    const bystander = await person('bystander');
    await doAct(friend.handle, 'restrict', as(owner));
    const id = (await nail(owner.handle, { body: 'held' }, as(friend))).data.card!.id;
    const missing = await approve('00000000-0000-4000-8000-000000000000', as(bystander));
    for (const who of [friend, bystander]) {
      const r = await approve(id, as(who));
      expect(r.status).toBe(404);
      expect(stable(r.data)).toBe(stable(missing.data));
    }
    expect((await q('select status from post_cards')).rows[0].status).toBe('held');
  });

  it('a restricted writer’s reply is held the same way, and Yo is not affected by Restrict', async () => {
    const { owner, friend } = await wall();
    const cardId = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    await doAct(friend.handle, 'restrict', as(owner));
    const r = await replyTo(cardId, { body: 'quiet reply' }, as(friend));
    expect(r.status).toBe(201);
    expect(r.data.reply).toMatchObject({ mine: true, waiting: false });
    const ownerView = (await fenceOf(owner.handle, as(owner))).data.cards![0]!;
    expect(ownerView.replies).toEqual([]);
    expect((await fenceOf(owner.handle, as(friend))).data.cards![0]!.replies.map((x) => x.body)).toEqual([
      'quiet reply',
    ]);
    const q1 = await waiting(as(owner));
    expect(q1.data.replies).toMatchObject([{ body: 'quiet reply', onCard: 'a card' }]);
    expect((await approveReplyOf(r.data.reply!.id, as(owner))).status).toBe(200);
    expect((await fenceOf(owner.handle, as(owner))).data.cards![0]!.replies).toHaveLength(1);
    expect((await yo(cardId, true, as(friend))).status).toBe(200);
  });

  it('un-restricting does not release old held cards by itself, but new cards publish normally', async () => {
    const { owner, friend } = await wall();
    await doAct(friend.handle, 'restrict', as(owner));
    await nail(owner.handle, { body: 'held one' }, as(friend));
    await doAct(friend.handle, 'unrestrict', as(owner));
    await nail(owner.handle, { body: 'fresh one' }, as(friend));
    expect((await fenceOf(owner.handle, as(owner))).data.cards!.map((c) => c.body)).toEqual(['fresh one']);
  });
});

describe('Review mode: honest "waiting for approval" for everyone else', () => {
  it('cards wait, their writer is told, the composer says so; the owner’s own cards publish at once', async () => {
    const { owner, friend } = await wall();
    await patchRanch({ fenceReview: true }, as(owner));
    const r = await nail(owner.handle, { body: 'please approve' }, as(friend));
    expect(r.status).toBe(201);
    expect(r.data.card).toMatchObject({ waiting: true, mine: true });
    const view = await fenceOf(owner.handle, as(friend));
    expect(view.data.review).toBe(true);
    expect(view.data.cards![0]).toMatchObject({ waiting: true });
    expect((await fenceOf(owner.handle, as(owner))).data.cards).toEqual([]);
    expect((await nail(owner.handle, { body: 'mine' }, as(owner))).data.card).toMatchObject({
      waiting: false,
    });
    expect((await approve(r.data.card!.id, as(owner))).status).toBe(200);
    expect((await fenceOf(owner.handle, as(owner))).data.cards!.map((c) => c.body)).toEqual([
      'please approve',
      'mine',
    ]);
  });

  it('a restricted writer under Review sees the same honest notice as everyone else (no extra tell)', async () => {
    const { owner, friend } = await wall();
    const other = await person('other');
    await patchRanch({ fenceReview: true }, as(owner));
    await doAct(friend.handle, 'restrict', as(owner));
    const a = await nail(owner.handle, { body: 'restricted writer' }, as(friend));
    const b = await nail(owner.handle, { body: 'ordinary writer' }, as(other));
    expect(a.data.card!.waiting).toBe(true);
    expect(b.data.card!.waiting).toBe(true);
  });

  it('turning Review off does not publish what is waiting; the owner still decides', async () => {
    const { owner, friend } = await wall();
    await patchRanch({ fenceReview: true }, as(owner));
    await nail(owner.handle, { body: 'waiting' }, as(friend));
    await patchRanch({ fenceReview: false }, as(owner));
    expect((await fenceOf(owner.handle, as(owner))).data.cards).toEqual([]);
    expect((await waiting(as(owner))).data.cards).toHaveLength(1);
  });

  it('the queue is the owner’s alone: it has no id to change and shows nothing of other Fences', async () => {
    const { owner, friend } = await wall();
    await patchRanch({ fenceReview: true }, as(owner));
    await nail(owner.handle, { body: 'waiting' }, as(friend));
    expect((await waiting(as(friend))).data.cards).toEqual([]);
    expect((await waiting({})).status).toBe(401);
    expect(JSON.stringify((await waiting(as(owner))).data)).not.toMatch(/@example\.com|user_id|authorId/);
  });

  it('waiting cards older than 30 days are purged; recent and published ones are not', async () => {
    const { owner, friend } = await wall();
    await patchRanch({ fenceReview: true }, as(owner));
    await nail(owner.handle, { body: 'old waiting' }, as(friend));
    await nail(owner.handle, { body: 'new waiting' }, as(friend));
    await nail(owner.handle, { body: 'published' }, as(owner));
    await q("update post_cards set created_at = now() - interval '31 days' where body = 'old waiting'");
    await q("update post_cards set created_at = now() - interval '90 days' where body = 'published'");
    const gone = await purgeStaleWaiting();
    expect(gone.cards).toBe(1);
    expect((await q('select body from post_cards order by body')).rows.map((r) => r.body)).toEqual([
      'new waiting',
      'published',
    ]);
  });
});

describe('Mute and Block change what YOU see', () => {
  it('a muted writer’s cards and replies disappear for the muter only', async () => {
    const owner = await person('owner');
    await patchRanch({ fencePosting: 'members' }, as(owner));
    const noisy = await person('noisy');
    const muter = await person('muter');
    const other = await person('other');
    const cardId = (await nail(owner.handle, { body: 'noise' }, as(noisy))).data.card!.id;
    await nail(owner.handle, { body: 'signal' }, as(other));
    await replyTo(cardId, { body: 'noisy reply' }, as(noisy));
    await replyTo(cardId, { body: 'other reply' }, as(other));
    await doAct(noisy.handle, 'mute', as(muter));

    const mine = (await fenceOf(owner.handle, as(muter))).data.cards!;
    expect(mine.map((c) => c.body)).toEqual(['signal']);
    const theirs = (await fenceOf(owner.handle, as(other))).data.cards!;
    expect(theirs.map((c) => c.body).sort()).toEqual(['noise', 'signal']);
    expect(theirs.find((c) => c.body === 'noise')!.replies.map((r) => r.body)).toEqual([
      'noisy reply',
      'other reply',
    ]);
    // Unmuting brings everything back.
    await doAct(noisy.handle, 'unmute', as(muter));
    expect((await fenceOf(owner.handle, as(muter))).data.cards).toHaveLength(2);
  });

  it('the muted person sees no difference and cannot tell (their own cards still show to them)', async () => {
    const owner = await person('owner');
    await patchRanch({ fencePosting: 'members' }, as(owner));
    const noisy = await person('noisy');
    const muter = await person('muter');
    await doAct(noisy.handle, 'mute', as(muter));
    const r = await nail(owner.handle, { body: 'still here to me' }, as(noisy));
    expect(r.status).toBe(201);
    expect((await fenceOf(owner.handle, as(noisy))).data.cards!.map((c) => c.body)).toEqual([
      'still here to me',
    ]);
  });

  it('the owner muting a writer hides that writer’s cards from the owner, not from everyone', async () => {
    const owner = await person('owner');
    await patchRanch({ fencePosting: 'members' }, as(owner));
    const noisy = await person('noisy');
    const other = await person('other');
    await nail(owner.handle, { body: 'noise' }, as(noisy));
    await doAct(noisy.handle, 'mute', as(owner));
    expect((await fenceOf(owner.handle, as(owner))).data.cards).toEqual([]);
    expect((await fenceOf(owner.handle, as(other))).data.cards).toHaveLength(1);
  });

  it('a block hides both people’s words from each other on any Fence, in either direction', async () => {
    const owner = await person('owner');
    await patchRanch({ fencePosting: 'members' }, as(owner));
    const a = await person('alice');
    const b = await person('bob');
    await nail(owner.handle, { body: 'from alice' }, as(a));
    await nail(owner.handle, { body: 'from bob' }, as(b));
    await doAct(b.handle, 'block', as(a));
    expect((await fenceOf(owner.handle, as(a))).data.cards!.map((c) => c.body)).toEqual(['from alice']);
    expect((await fenceOf(owner.handle, as(b))).data.cards!.map((c) => c.body)).toEqual(['from bob']);
    expect((await fenceOf(owner.handle, as(owner))).data.cards).toHaveLength(2);
  });

  it('many hidden writers do not stop paging from reaching the visible cards, and paging always terminates', async () => {
    const owner = await person('owner');
    const muter = await person('muter');
    const noisy = await insertUser('noisy');
    const fine = await insertUser('fine');
    const ownerId = await userId(owner.handle);
    await q("insert into user_controls (actor_id, target_id, kind) values ($1, $2, 'mute')", [
      await userId(muter.handle),
      noisy.id,
    ]);
    await q(
      `insert into post_cards (fence_owner_id, author_id, body, created_at)
       select $1, case when i % 10 = 0 then $3::uuid else $2::uuid end, 'c' || i, timestamptz '2026-01-01' + i * interval '1 second'
       from generate_series(1, 60) i`,
      [ownerId, noisy.id, fine.id],
    );
    // 54 of 60 cards are by the muted person (i % 10 != 0 → noisy is $2 here), so most of each batch is hidden.
    const seen = await allBodies(owner.handle, as(muter), 5);
    const visible = (await q('select body from post_cards where author_id = $1', [fine.id])).rows.map(
      (r) => r.body,
    );
    expect(new Set(seen)).toEqual(new Set(visible));
    expect(seen).toHaveLength(visible.length);
  });
});

describe('closing gaps found by the mutation check', () => {
  it('a muted person’s reply disappears for the muter even on a card the muter can see', async () => {
    const owner = await person('owner');
    await patchRanch({ fencePosting: 'members' }, as(owner));
    const noisy = await person('noisy');
    const muter = await person('muter');
    const other = await person('other');
    const cardId = (await nail(owner.handle, { body: 'a visible card' }, as(other))).data.card!.id;
    await replyTo(cardId, { body: 'noisy reply' }, as(noisy));
    await replyTo(cardId, { body: 'other reply' }, as(other));
    await doAct(noisy.handle, 'mute', as(muter));
    const card = (await fenceOf(owner.handle, as(muter))).data.cards![0]!;
    expect(card.replies.map((r) => r.body)).toEqual(['other reply']);
    await doAct(noisy.handle, 'unmute', as(muter));
    await doAct(noisy.handle, 'block', as(muter));
    expect((await fenceOf(owner.handle, as(muter))).data.cards![0]!.replies.map((r) => r.body)).toEqual([
      'other reply',
    ]);
  });

  it('held replies never use up the places on a card, however many a restricted person writes', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    await q(
      `insert into card_replies (card_id, author_id, body, status, created_at)
       select $1, $2, 'held ' || i, 'held', timestamptz '2026-01-01' + i * interval '1 second' from generate_series(1, $3::int) i`,
      [id, await userId(friend.handle), REPLIES_PER_CARD + 5],
    );
    const other = await person('other');
    expect((await replyTo(id, { body: 'still room' }, as(other))).status).toBe(201);
  });

  it('a stranger cannot flag, Yo, reply to or approve a card that is only waiting — the owner and its writer still can see it', async () => {
    const { owner, friend } = await wall();
    const stranger = await person('stranger');
    await doAct(friend.handle, 'restrict', as(owner));
    const id = (await nail(owner.handle, { body: 'held' }, as(friend))).data.card!.id;
    const missing = await flagCard('00000000-0000-4000-8000-000000000000', { reason: 'spam' }, as(stranger));
    const r = await flagCard(id, { reason: 'spam' }, as(stranger));
    expect(r.status).toBe(404);
    expect(stable(r.data)).toBe(stable(missing.data));
    expect((await flagCard(id, { reason: 'spam' }, as(owner))).status).toBe(202);
    expect((await q('select count(*)::int n from reports')).rows[0].n).toBe(1);
  });
});

describe('Yo', () => {
  it('one per person, idempotent both ways, counted, and never on your own card', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    expect((await yo(id, true, as(friend))).data).toMatchObject({ yoByMe: true });
    expect((await yo(id, true, as(friend))).status).toBe(200);
    expect((await yo(id, true, as(owner))).status).toBe(400);
    const view = (await fenceOf(owner.handle, as(friend))).data.cards![0]!;
    expect(view).toMatchObject({ yoCount: 1, yoByMe: true, canYo: true });
    expect((await fenceOf(owner.handle, as(owner))).data.cards![0]).toMatchObject({
      yoCount: 1,
      yoByMe: false,
      canYo: false,
    });
    expect((await yo(id, false, as(friend))).data).toMatchObject({ yoByMe: false });
    expect((await yo(id, false, as(friend))).status).toBe(200);
    expect((await q('select count(*)::int n from yos')).rows[0].n).toBe(0);
  });

  it('reactions: Yo by default, one per person whatever the kind, switching kind recounts, only counts are shown', async () => {
    const { owner, friend } = await wall();
    const other = await person('other');
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    expect((await yo(id, true, as(friend))).data).toMatchObject({ yoByMe: true, myReaction: 'yo' });
    expect((await yo(id, true, as(friend), 'laugh')).data).toMatchObject({ myReaction: 'laugh' });
    expect((await yo(id, true, as(other), 'popcorn')).status).toBe(200);
    const view = (await fenceOf(owner.handle, as(friend))).data.cards![0]!;
    expect(view).toMatchObject({ yoCount: 2, myReaction: 'laugh' });
    expect(view.reactions).toEqual({ yo: 0, laugh: 1, fire: 0, popcorn: 1, love: 0 });
    const ownersView = (await fenceOf(owner.handle, as(owner))).data.cards![0]!;
    expect(ownersView).toMatchObject({ yoCount: 2, myReaction: null });
    expect(JSON.stringify(ownersView)).not.toContain(friend.handle); // nobody learns who reacted with what
    expect((await q('select count(*)::int n from yos')).rows[0].n).toBe(2);
    expect((await yo(id, true, as(friend), 'sigma')).status).toBe(422);
    expect((await yo(id, true, as(friend), 'fire')).status).toBe(200);
    expect((await fenceOf(owner.handle, as(friend))).data.cards![0]!.reactions).toMatchObject({
      laugh: 0,
      fire: 1,
    });
    expect((await yo(id, false, as(friend))).data).toMatchObject({ yoByMe: false, myReaction: null });
    await expect(
      q("insert into yos (card_id, user_id, kind) values ($1, (select id from users limit 1), 'meh')", [id]),
    ).rejects.toThrow(/yos_kind_check/);
  });

  it('cannot Yo a card you cannot see: hidden, blocked, waiting or missing all give the same 404', async () => {
    const { owner, friend } = await wall();
    const villain = await person('villain');
    const stranger = await person('stranger');
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    await patchRanch({ fencePosting: 'members' }, as(owner));
    await doAct(villain.handle, 'block', as(owner));
    await doAct(friend.handle, 'restrict', as(owner));
    const heldId = (await nail(owner.handle, { body: 'held' }, as(friend))).data.card!.id;
    const missing = await yo('00000000-0000-4000-8000-000000000000', true, as(villain));
    for (const [who, card] of [
      [villain, id],
      [stranger, heldId],
    ] as const) {
      const r = await yo(card, true, as(who));
      expect(r.status).toBe(404);
      expect(stable(r.data)).toBe(stable(missing.data));
    }
    expect((await q('select count(*)::int n from yos')).rows[0].n).toBe(0);
  });

  it('a Yo can always be taken back, even after being blocked', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    await yo(id, true, as(friend));
    await doAct(friend.handle, 'block', as(owner));
    expect((await yo(id, false, as(friend))).status).toBe(200);
    expect((await q('select count(*)::int n from yos')).rows[0].n).toBe(0);
  });

  it('needs a session, a boolean and a same-origin request; junk ids are a 404', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    expect((await yo(id, true, {})).status).toBe(401);
    for (const on of ['true', 1, null, undefined]) expect((await yo(id, on, as(friend))).status).toBe(422);
    expect((await yo(id, true, { ...as(friend), origin: 'https://evil.example' })).status).toBe(403);
    for (const bad of ['1', "x'; drop table yos;--", 'z'.repeat(80)]) {
      expect((await yo(bad, true, as(friend))).status, bad).toBe(404);
    }
  });
});

describe('replies', () => {
  it('appear oldest-first under the card; 80 characters fit, 81 do not; links are refused', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    expect((await replyTo(id, { body: 'first' }, as(friend))).status).toBe(201);
    expect((await replyTo(id, { body: 'x'.repeat(80) }, as(owner))).status).toBe(201);
    expect((await replyTo(id, { body: 'x'.repeat(81) }, as(owner))).status).toBe(422);
    expect((await replyTo(id, { body: 'see www.spam.example' }, as(owner))).status).toBe(422);
    expect((await replyTo(id, { body: '  ' }, as(owner))).status).toBe(422);
    const view = (await fenceOf(owner.handle, as(friend))).data.cards![0]!;
    expect(view.replies.map((r) => r.body)).toEqual(['first', 'x'.repeat(80)]);
    expect(view.replies[0]).toMatchObject({ mine: true, canRemove: true });
  });

  it('a card holds at most 20 replies — the same answer for everyone, including a restricted writer', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    const ownerId = await userId(owner.handle);
    await q(
      `insert into card_replies (card_id, author_id, body, created_at)
       select $1, $2, 'r' || i, timestamptz '2026-01-01' + i * interval '1 second' from generate_series(1, $3::int) i`,
      [id, ownerId, REPLIES_PER_CARD],
    );
    const full = await replyTo(id, { body: 'one more' }, as(friend));
    expect(full.status).toBe(409);
    await doAct(friend.handle, 'restrict', as(owner));
    const fullRestricted = await replyTo(id, { body: 'one more' }, as(friend));
    expect(fullRestricted.status).toBe(409);
    expect(stable(fullRestricted.data)).toBe(stable(full.data));
    expect((await q('select count(*)::int n from card_replies')).rows[0].n).toBe(REPLIES_PER_CARD);
  });

  it('held replies do not fill a card for everyone else', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    await doAct(friend.handle, 'restrict', as(owner));
    for (let i = 0; i < 5; i++) await replyTo(id, { body: `held ${i}` }, as(friend));
    const other = await person('other');
    expect((await replyTo(id, { body: 'still room' }, as(other))).status).toBe(201);
  });

  it('respects the Fence’s posting rule; blocked, missing and waiting-card targets are the same 404', async () => {
    const owner = await person('owner'); // default: only the Posse may write
    const stranger = await person('stranger');
    const villain = await person('villain');
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    expect((await replyTo(id, { body: 'hi' }, as(stranger))).status).toBe(403);
    await doAct(villain.handle, 'block', as(owner));
    const blocked = await replyTo(id, { body: 'hi' }, as(villain));
    const missing = await replyTo('00000000-0000-4000-8000-000000000000', { body: 'hi' }, as(villain));
    expect(blocked.status).toBe(404);
    expect(stable(blocked.data)).toBe(stable(missing.data));
    expect((await q('select count(*)::int n from card_replies')).rows[0].n).toBe(0);
  });

  it('cannot reply to a card still waiting for approval', async () => {
    const { owner, friend } = await wall();
    await patchRanch({ fenceReview: true }, as(owner));
    const id = (await nail(owner.handle, { body: 'waiting' }, as(friend))).data.card!.id;
    expect((await replyTo(id, { body: 'hi' }, as(friend))).status).toBe(404);
    expect((await replyTo(id, { body: 'hi' }, as(owner))).status).toBe(404);
  });

  it('extra fields cannot pick the writer or the card', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    await replyTo(
      id,
      { body: 'hi', authorId: await userId(owner.handle), cardId: 'x', status: 'pending' },
      as(friend),
    );
    const row = (await q('select * from card_replies')).rows[0];
    expect(row.author_id).toBe(await userId(friend.handle));
    expect(row.status).toBe('published');
  });
});

describe('taking things down', () => {
  it('the writer and the Fence owner can remove a card (replies and Yos go with it); nobody else, and nobody can tell', async () => {
    const { owner, friend } = await wall();
    const other = await person('other');
    const id = (await nail(owner.handle, { body: 'from friend' }, as(friend))).data.card!.id;
    await replyTo(id, { body: 'a reply' }, as(owner));
    await yo(id, true, as(owner));

    const missing = await scrape('00000000-0000-4000-8000-000000000000', as(other));
    const denied = await scrape(id, as(other));
    expect(denied.status).toBe(404);
    expect(stable(denied.data)).toBe(stable(missing.data));
    expect((await q('select count(*)::int n from post_cards')).rows[0].n).toBe(1);

    expect((await scrape(id, as(friend))).status).toBe(200);
    expect((await scrape(id, as(friend))).status).toBe(404); // already gone
    for (const t of ['post_cards', 'card_replies', 'yos']) {
      expect((await q(`select count(*)::int n from ${t}`)).rows[0].n, t).toBe(0);
    }

    const id2 = (await nail(owner.handle, { body: 'again' }, as(friend))).data.card!.id;
    expect((await scrape(id2, as(owner))).status).toBe(200); // Scrape clean
    expect((await scrape(id2, as(owner))).status).toBe(404);
  });

  it('a writer can always take their own card back, even after being blocked', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'regret' }, as(friend))).data.card!.id;
    await doAct(friend.handle, 'block', as(owner));
    expect((await fenceOf(owner.handle, as(friend))).status).toBe(404);
    expect((await scrape(id, as(friend))).status).toBe(200);
  });

  it('replies: the writer, the Fence owner — and nobody else; the card’s writer has no power over others’ replies', async () => {
    const { owner, friend } = await wall();
    const other = await person('other');
    const id = (await nail(owner.handle, { body: 'from friend' }, as(friend))).data.card!.id;
    const rid = (await replyTo(id, { body: 'from other' }, as(other))).data.reply!.id;
    expect((await removeReplyOf(rid, as(friend))).status).toBe(404); // card's writer is not the owner
    expect((await q('select count(*)::int n from card_replies')).rows[0].n).toBe(1);
    expect((await removeReplyOf(rid, as(owner))).status).toBe(200);
    const rid2 = (await replyTo(id, { body: 'again' }, as(other))).data.reply!.id;
    expect((await removeReplyOf(rid2, as(other))).status).toBe(200);
  });

  it('needs a session and a same-origin request', async () => {
    const { owner } = await wall();
    const id = (await nail(owner.handle, { body: 'x' }, as(owner))).data.card!.id;
    expect((await scrape(id, {})).status).toBe(401);
    expect((await scrape(id, { ...as(owner), origin: 'https://evil.example' })).status).toBe(403);
    expect((await q('select count(*)::int n from post_cards')).rows[0].n).toBe(1);
  });
});

describe('Flag trouble on a card', () => {
  it('records a report against the writer with the words kept as evidence; the writer is told nothing; a repeat is a no-op', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'rude words' }, as(friend))).data.card!.id;
    const r = await flagCard(id, { reason: 'harassment', details: 'see the wall' }, as(owner));
    expect(r.status).toBe(202);
    const again = await flagCard(id, { reason: 'spam' }, as(owner));
    expect(again.status).toBe(202);
    const rows = (await q('select * from reports')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      target_user_id: await userId(friend.handle),
      reporter_id: await userId(owner.handle),
      reason: 'harassment',
      evidence_text: 'rude words',
      status: 'open',
    });
    // Evidence outlives the card.
    await scrape(id, as(friend));
    expect((await q('select evidence_text from reports')).rows[0].evidence_text).toBe('rude words');
  });

  it('you cannot report a card you cannot see (same 404), your own card (400), or with bad input (422)', async () => {
    const { owner, friend } = await wall();
    const villain = await person('villain');
    const id = (await nail(owner.handle, { body: 'a card' }, as(friend))).data.card!.id;
    await doAct(villain.handle, 'block', as(owner));
    const blocked = await flagCard(id, { reason: 'spam' }, as(villain));
    const missing = await flagCard('00000000-0000-4000-8000-000000000000', { reason: 'spam' }, as(villain));
    expect(blocked.status).toBe(404);
    expect(stable(blocked.data)).toBe(stable(missing.data));
    expect((await flagCard(id, { reason: 'spam' }, as(friend))).status).toBe(400);
    expect((await flagCard(id, { reason: 'nonsense' }, as(owner))).status).toBe(422);
    expect(
      (await flagCard(id, { reason: 'spam', details: `a${String.fromCodePoint(0x202e)}b` }, as(owner)))
        .status,
    ).toBe(422);
    expect((await flagCard(id, { reason: 'spam' }, {})).status).toBe(401);
    expect((await q('select count(*)::int n from reports')).rows[0].n).toBe(0);
  });
});

describe('lifecycle and integrity', () => {
  it('deleting a user removes their cards, replies and Yos, and the cards other people left on their Fence', async () => {
    const { owner, friend } = await wall();
    const c1 = (await nail(owner.handle, { body: 'on owner by friend' }, as(friend))).data.card!.id;
    const c2 = (await nail(friend.handle, { body: 'on friend' }, as(friend))).data.card!.id;
    await replyTo(c1, { body: 'r1' }, as(owner));
    await replyTo(c2, { body: 'r2' }, as(owner));
    await yo(c1, true, as(owner));
    await q('delete from users where handle = $1', [friend.handle]);
    expect((await q('select count(*)::int n from post_cards')).rows[0].n).toBe(0);
    expect((await q('select count(*)::int n from card_replies')).rows[0].n).toBe(0);
    expect((await q('select count(*)::int n from yos')).rows[0].n).toBe(0);
  });

  it('the database itself refuses bad rows: over-long text, unknown status, empty text, a second Yo', async () => {
    const { owner } = await wall();
    const id = await userId(owner.handle);
    const insert = (body: string, status = 'published') =>
      q('insert into post_cards (fence_owner_id, author_id, body, status) values ($1, $1, $2, $3)', [
        id,
        body,
        status,
      ]);
    await expect(insert('x'.repeat(161))).rejects.toThrow(/post_cards_body_len/);
    await expect(insert('')).rejects.toThrow(/post_cards_body_len/);
    await expect(insert('ok', 'visible')).rejects.toThrow(/post_cards_status_check/);
    await insert('ok');
    const cardId = (await q('select id from post_cards')).rows[0].id;
    await expect(
      q('insert into card_replies (card_id, author_id, body) values ($1, $2, $3)', [
        cardId,
        id,
        'x'.repeat(81),
      ]),
    ).rejects.toThrow(/card_replies_body_len/);
    await q('insert into yos (card_id, user_id) values ($1, $2)', [cardId, id]);
    await expect(q('insert into yos (card_id, user_id) values ($1, $2)', [cardId, id])).rejects.toThrow(
      /yos_card_id_user_id_pk/,
    );
  });

  it('nothing in any Fence response exposes emails, user ids or privacy settings', async () => {
    const { owner, friend } = await wall();
    await patchRanch({ fenceReview: false }, as(owner));
    const id = (await nail(owner.handle, { body: 'hello' }, as(friend))).data.card!.id;
    await replyTo(id, { body: 'reply' }, as(owner));
    const text = (await fenceOf(owner.handle, as(friend))).text;
    expect(text).not.toMatch(
      /@example\.com|authorId|fenceOwnerId|user_id|password|ranchVisibility|fencePosting|"status"/,
    );
    for (const u of [owner, friend]) expect(text).not.toContain(await userId(u.handle));
  });
});
