import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { purgeOldChimes } from '@/modules/notifications';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { subscribe } from '@/platform/events';
import { freshAuthState, signedInUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { bell, chimesOf, getPrefs, markRead, patchPrefs, texts, types } from '../helpers/chimes';
import { approve, fenceOf, nail, replyTo, scrape, yo } from '../helpers/fence';
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
const rows = async () => (await q('select count(*)::int n from notifications')).rows[0].n as number;

async function posse(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
/** An owner whose Fence anyone in the Posse (or any member) may write on, and a friend in their Posse. */
async function wall() {
  const owner = await person('owner');
  await patchRanch({ fencePosting: 'members' }, as(owner));
  const friend = await person('friend');
  await posse(owner, friend);
  await flushBackground();
  await q('delete from notifications'); // start each scenario from a quiet bell
  return { owner, friend };
}

describe('Posse Chimes', () => {
  it('an ask rings the asked person’s bell, an accept rings the asker’s — and nobody rings their own', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    expect(await texts(as(b))).toEqual([`${a.handle} wants to be your Pal.`]);
    expect((await chimesOf(as(b))).data.chimes![0]).toMatchObject({
      type: 'posse_requested',
      href: '/pals',
      unread: true,
    });
    expect(await bell(as(b))).toBe(1);
    expect(await texts(as(a))).toEqual([]);

    await doAct(a.handle, 'accept', as(b));
    expect(await texts(as(a))).toEqual([`${b.handle} said yes. You are Pals now.`]);
    expect((await chimesOf(as(a))).data.chimes![0]!.href).toBe(`/porch/${b.handle}`);
    expect(await bell(as(b))).toBe(1); // accepting rings nothing for the accepter
  });

  it('asking back (mutual requests) tells the first asker they are in; repeats and idempotent accepts add nothing', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'request', as(b));
    expect(await types(as(a))).toEqual(['posse_accepted']);
    await doAct(a.handle, 'accept', as(b)); // already members
    await doAct(b.handle, 'request', as(a)); // already members
    expect(await rows()).toBe(2);
  });

  it('a person who cancels and asks again rings again (one row, unread again); it never piles up', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await markRead({ all: true }, as(b));
    expect(await bell(as(b))).toBe(0);
    await doAct(b.handle, 'cancel', as(a));
    await doAct(b.handle, 'request', as(a));
    expect(await bell(as(b))).toBe(1);
    expect(await rows()).toBe(1);
  });

  it('a blocked person’s ask rings nothing; a declined one stays quiet; a muted one is silent', async () => {
    const a = await person('alice');
    const villain = await person('villain');
    const noisy = await person('noisy');
    await doAct(villain.handle, 'block', as(a));
    expect((await doAct(a.handle, 'request', as(villain))).status).toBe(200); // looks like any ask
    await doAct(noisy.handle, 'mute', as(a));
    await doAct(a.handle, 'request', as(noisy));
    expect(await bell(as(a))).toBe(0);
    expect(await rows()).toBe(0);
  });

  it('a decline rings nobody (the asker is never told), and asking again during the cooldown rings nothing', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'decline', as(b));
    expect(await bell(as(a))).toBe(0);
    expect(await texts(as(a))).toEqual([]);
    await markRead({ all: true }, as(b));
    await doAct(b.handle, 'request', as(a)); // still cooling down: changes nothing, so must not ring
    expect(await bell(as(b))).toBe(0);
  });

  it('a Posse Chime from someone the recipient restricted is not sent', async () => {
    const a = await person('alice');
    const r = await person('restricted');
    await doAct(r.handle, 'restrict', as(a));
    await doAct(a.handle, 'request', as(r));
    expect(await bell(as(a))).toBe(0);
  });
});

describe('Fence Chimes', () => {
  it('a card on my Fence rings me; my own card, and a Yo/reply on someone else’s card, do not', async () => {
    const { owner, friend } = await wall();
    await nail(owner.handle, { body: 'mine' }, as(owner));
    expect(await bell(as(owner))).toBe(0);
    await nail(owner.handle, { body: 'hello' }, as(friend));
    expect((await chimesOf(as(owner))).data.chimes![0]).toMatchObject({
      type: 'card_created',
      text: `${friend.handle} nailed a card to your Fence.`,
      href: `/porch/${owner.handle}`,
    });
    expect(await bell(as(friend))).toBe(0);
  });

  it('a reply rings the card’s writer and the Fence owner, never the person who replied', async () => {
    const { owner, friend } = await wall();
    const third = await person('third');
    const cardId = (await nail(owner.handle, { body: 'from third' }, as(third))).data.card!.id;
    await flushBackground();
    await q('delete from notifications');
    await replyTo(cardId, { body: 'a reply' }, as(friend));
    expect(await texts(as(third))).toEqual([`${friend.handle} scribbled a reply on your card.`]);
    expect(await texts(as(owner))).toEqual([`${friend.handle} scribbled a reply on a card on your Fence.`]);
    expect(await texts(as(friend))).toEqual([]);
    // The card's writer being the owner rings once, not twice.
    const own = (await nail(owner.handle, { body: 'owner card' }, as(owner))).data.card!.id;
    await replyTo(own, { body: 'hi' }, as(friend));
    expect((await types(as(owner))).filter((t) => t === 'reply_created')).toHaveLength(2); // one per card
    expect(await bell(as(owner))).toBe(2);
  });

  it('a Yo rings the card’s writer once — switching it off and on again cannot ring the bell again', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    for (let i = 0; i < 3; i++) {
      await yo(id, true, as(friend));
      await yo(id, false, as(friend));
    }
    await yo(id, true, as(friend));
    expect(await texts(as(owner))).toEqual([`${friend.handle} reacted to your card.`]);
    await markRead({ all: true }, as(owner));
    await yo(id, false, as(friend));
    await yo(id, true, as(friend));
    await yo(id, true, as(friend), 'love'); // changing the kind is not a new reaction either
    expect(await bell(as(owner))).toBe(0);
  });

  it('Review: the owner is told a card waits, the writer is told once it is approved', async () => {
    const { owner, friend } = await wall();
    await patchRanch({ fenceReview: true }, as(owner));
    const id = (await nail(owner.handle, { body: 'please' }, as(friend))).data.card!.id;
    expect(await types(as(owner))).toEqual(['card_waiting']);
    expect((await chimesOf(as(owner))).data.chimes![0]!.text).toBe(
      `A card from ${friend.handle} is waiting for your approval.`,
    );
    expect(await texts(as(friend))).toEqual([]);
    await approve(id, as(owner));
    expect(await texts(as(friend))).toEqual([`${owner.handle} approved your card. It is on the Fence now.`]);
  });

  it('Restrict: the owner gets the SAME "waiting" Chime, and approving a held card tells its writer NOTHING (that would reveal it)', async () => {
    const { owner, friend } = await wall();
    await doAct(friend.handle, 'restrict', as(owner));
    const id = (await nail(owner.handle, { body: 'held' }, as(friend))).data.card!.id;
    const held = (await chimesOf(as(owner))).data.chimes![0]!;
    expect(held).toMatchObject({
      type: 'card_waiting',
      text: `A card from ${friend.handle} is waiting for your approval.`,
    });
    await approve(id, as(owner));
    expect(await rows()).toBe(1);
    expect(await bell(as(friend))).toBe(0);
    expect(await texts(as(friend))).toEqual([]);
  });

  it('a restricted writer’s reply rings the owner as "waiting", and their Yo and published-looking words ring nobody else', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    await doAct(friend.handle, 'restrict', as(owner));
    await replyTo(id, { body: 'held reply' }, as(friend));
    await yo(id, true, as(friend));
    expect(await types(as(owner))).toEqual(['reply_waiting']); // the Yo from a restricted person is silent
  });

  it('a muted or blocked writer never rings the bell; switching a kind off silences that kind only', async () => {
    const { owner, friend } = await wall();
    const noisy = await person('noisy');
    await doAct(noisy.handle, 'mute', as(owner));
    await nail(owner.handle, { body: 'noise' }, as(noisy));
    expect(await bell(as(owner))).toBe(0);

    await patchPrefs({ fence: false }, as(owner));
    await nail(owner.handle, { body: 'hello' }, as(friend));
    const id = (await nail(owner.handle, { body: 'mine' }, as(owner))).data.card!.id;
    await yo(id, true, as(friend));
    await replyTo(id, { body: 'reply' }, as(friend));
    expect(await types(as(owner))).toEqual(['reply_created', 'yo_given']);
    await patchPrefs({ yo: false, replies: false }, as(owner));
    const id2 = (await nail(owner.handle, { body: 'mine 2' }, as(owner))).data.card!.id;
    await yo(id2, true, as(friend));
    expect(await rows()).toBe(2);
  });
});

describe('what is shown is decided when it is read', () => {
  it('blocking someone hides their Chimes at once and the count follows; unmuting brings them back', async () => {
    const { owner, friend } = await wall();
    const other = await person('other');
    await nail(owner.handle, { body: 'a' }, as(friend));
    await nail(owner.handle, { body: 'b' }, as(other));
    expect(await bell(as(owner))).toBe(2);
    await doAct(other.handle, 'mute', as(owner));
    expect(await bell(as(owner))).toBe(1);
    expect(await texts(as(owner))).toEqual([`${friend.handle} nailed a card to your Fence.`]);
    await doAct(other.handle, 'unmute', as(owner));
    expect(await bell(as(owner))).toBe(2);
    await doAct(friend.handle, 'block', as(owner));
    expect((await chimesOf(as(owner))).data.chimes!.map((c) => c.actor.handle)).toEqual([other.handle]);
    expect(await bell(as(owner))).toBe(1);
    // …and being blocked BY the actor hides it too.
    await doAct(owner.handle, 'block', as(other));
    expect((await chimesOf(as(owner))).data.chimes).toEqual([]);
    expect(await bell(as(owner))).toBe(0);
  });

  it('a suspended actor disappears; a removed card takes its Chimes with it; a deleted person takes theirs', async () => {
    const { owner, friend } = await wall();
    const other = await person('other');
    const c1 = (await nail(owner.handle, { body: 'a' }, as(friend))).data.card!.id;
    await nail(owner.handle, { body: 'b' }, as(other));
    await q("update users set status = 'suspended' where handle = $1", [other.handle]);
    expect(await bell(as(owner))).toBe(1);
    await scrape(c1, as(owner));
    expect(await bell(as(owner))).toBe(0);
    expect(await rows()).toBe(1); // the suspended person's row still exists (kept until deletion) but is not shown
    await q('delete from users where handle = $1', [other.handle]);
    expect(await rows()).toBe(0);
  });

  it('a Chime about a Fence I can no longer read is not shown (hidden ≡ missing)', async () => {
    const { owner, friend } = await wall();
    const third = await person('third');
    const cardId = (await nail(owner.handle, { body: 'from third' }, as(third))).data.card!.id;
    await replyTo(cardId, { body: 'hi' }, as(friend));
    expect(await bell(as(third))).toBe(1);
    await doAct(third.handle, 'block', as(owner)); // the owner blocks the card's writer
    expect((await fenceOf(owner.handle, as(third))).status).toBe(404);
    expect((await chimesOf(as(third))).data.chimes).toEqual([]);
    expect(await bell(as(third))).toBe(0);
  });

  it('a Chime about a card is only shown while the card is public (never a waiting card)', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(friend))).data.card!.id;
    await q("update post_cards set status = 'held' where id = $1", [id]);
    expect((await chimesOf(as(owner))).data.chimes).toEqual([]);
  });

  it('the count and the list always agree, whatever is hidden', async () => {
    const owner = await person('owner');
    const hidden = await person('hidden');
    await patchRanch({ fencePosting: 'members' }, as(owner));
    const others = [await person('o1'), await person('o2')];
    for (const p of [hidden, ...others]) await nail(owner.handle, { body: `from ${p.handle}` }, as(p));
    await doAct(hidden.handle, 'mute', as(owner));
    const list = await chimesOf(as(owner));
    expect(list.data.chimes).toHaveLength(2);
    expect(list.data.unread).toBe(2);
    expect(await bell(as(owner))).toBe(2);
  });
});

describe('the person who acted learns nothing', () => {
  it('a failing listener cannot fail or change the action', async () => {
    const { owner, friend } = await wall();
    const stop = subscribe(async () => {
      throw new Error('listener exploded');
    });
    const r = await nail(owner.handle, { body: 'still works' }, as(friend));
    await flushBackground();
    stop();
    expect(r.status).toBe(201);
    expect((await fenceOf(owner.handle, as(owner))).data.cards!.map((c) => c.body)).toEqual(['still works']);
  });

  it('the same action gets a byte-identical answer whether the recipient hears it, muted the actor, or turned Chimes off', async () => {
    const { owner, friend } = await wall();
    const id = (await nail(owner.handle, { body: 'a card' }, as(owner))).data.card!.id;
    const shape = (r: { status: number; data: unknown }) =>
      `${r.status}:${stable(r.data as object).replace(/"id":"[^"]+"|"createdAt":"[^"]+"/g, '')}`;
    const heard = await yo(id, true, as(friend));
    await yo(id, false, as(friend));
    await doAct(friend.handle, 'mute', as(owner));
    const muted = await yo(id, true, as(friend));
    await yo(id, false, as(friend));
    await doAct(friend.handle, 'unmute', as(owner));
    await patchPrefs({ yo: false }, as(owner));
    const off = await yo(id, true, as(friend));
    expect(shape(muted)).toBe(shape(heard));
    expect(shape(off)).toBe(shape(heard));
  });
});

describe('reading, paging and counting', () => {
  async function chimeFrom(recipient: string, count: number, base = '2026-01-01') {
    const to = await userId(recipient);
    for (let i = 0; i < count; i++) {
      const actor = await insertUser('act');
      await q(
        `insert into notifications (recipient_id, actor_id, type, created_at) values ($1, $2, 'posse_requested', timestamptz '${base}' + $3 * interval '1 second')`,
        [to, actor.id, i],
      );
    }
  }

  it('pages newest-first with no repeats or gaps, and the last page has no cursor', async () => {
    const me = await person('me');
    await chimeFrom(me.handle, 45);
    const seen: string[] = [];
    let cursor: string | null | undefined;
    for (let i = 0; i < 20; i++) {
      const r = await chimesOf(as(me), `?limit=20${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...r.data.chimes!.map((c) => c.id));
      cursor = r.data.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(45);
    expect(new Set(seen).size).toBe(45);
    const order = (await q('select id from notifications order by created_at desc, id desc')).rows.map(
      (r) => r.id,
    );
    expect(seen).toEqual(order);
  });

  it('tampered cursors and out-of-range limits are 400s', async () => {
    const me = await person('me');
    for (const query of [
      '?cursor=zzz',
      '?cursor=%27%3B--',
      '?cursor=' + 'A'.repeat(101),
      '?limit=0',
      '?limit=51',
      '?limit=x',
    ]) {
      expect((await chimesOf(as(me), query)).status, query).toBe(400);
    }
  });

  it('the unread count stops at 99', async () => {
    const me = await person('me');
    await chimeFrom(me.handle, 120);
    expect(await bell(as(me))).toBe(99);
    expect((await chimesOf(as(me))).data.unread).toBe(99);
  });

  it('hidden people cannot stall paging: the visible Chimes are still reached', async () => {
    const me = await person('me');
    const muter = await userId(me.handle);
    await chimeFrom(me.handle, 30, '2026-02-01'); // 30 recent from people I will mute
    const muted = (await q('select actor_id from notifications where recipient_id = $1', [muter])).rows.map(
      (r) => r.actor_id,
    );
    for (const id of muted)
      await q("insert into user_controls (actor_id, target_id, kind) values ($1, $2, 'mute')", [muter, id]);
    await chimeFrom(me.handle, 3, '2026-01-01'); // 3 older, visible
    const seen: string[] = [];
    let cursor: string | null | undefined;
    for (let i = 0; i < 30; i++) {
      const r = await chimesOf(as(me), `?limit=5${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...r.data.chimes!.map((c) => c.id));
      cursor = r.data.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(3);
  });

  it('needs a session; responses carry no ids of people, emails or card ids', async () => {
    const { owner, friend } = await wall();
    await nail(owner.handle, { body: 'hello' }, as(friend));
    expect((await chimesOf({})).status).toBe(401);
    const text = (await chimesOf(as(owner))).text;
    expect(text).not.toMatch(/@example\.com|actorId|recipientId|cardId|user_id/);
    for (const u of [owner, friend]) expect(text).not.toContain(await userId(u.handle));
    expect(text).not.toContain((await q('select id from post_cards')).rows[0].id);
  });

  it('reading is limited per person and fails closed', async () => {
    const me = await person('me');
    let status = 0;
    for (let i = 0; i < 241; i++) status = (await chimesOf(as(me))).status;
    expect(status).toBe(429);
  });
});

describe('marking read', () => {
  it('marks the named Chimes or all of them, only ever the caller’s own; repeating is harmless', async () => {
    const { owner, friend } = await wall();
    await nail(owner.handle, { body: 'one' }, as(friend));
    await nail(owner.handle, { body: 'two' }, as(friend));
    await doAct(owner.handle, 'request', as(friend)); // (friend is already in the Posse: no chime)
    const mine = (await chimesOf(as(owner))).data.chimes!;
    expect(mine.length).toBeGreaterThanOrEqual(1);

    const other = await person('other');
    await nail(other.handle, { body: 'to other' }, as(other));
    await doAct(other.handle, 'request', as(friend));
    await flushBackground();
    const theirs = (await chimesOf(as(other))).data.chimes!;
    expect(theirs).toHaveLength(1);
    // The owner tries to mark the other person's Chime read: nothing happens, and it looks like any unknown id.
    const denied = await markRead({ ids: [theirs[0]!.id] }, as(owner));
    const missing = await markRead({ ids: ['00000000-0000-4000-8000-000000000000'] }, as(owner));
    expect(denied.status).toBe(200);
    expect(stable(denied.data)).toBe(stable(missing.data));
    expect((await chimesOf(as(other))).data.chimes![0]!.unread).toBe(true);

    const first = await markRead({ ids: [mine[0]!.id] }, as(owner));
    expect(first.data.marked).toBe(1);
    expect((await markRead({ ids: [mine[0]!.id] }, as(owner))).data.marked).toBe(0);
    await markRead({ all: true }, as(owner));
    expect(await bell(as(owner))).toBe(0);
    expect((await chimesOf(as(owner))).data.chimes!.every((c) => !c.unread)).toBe(true);
    expect(await bell(as(other))).toBe(1); // untouched
  });

  it('"all, before" (opening the Chimes page) leaves a Chime that rang after the page was drawn unread', async () => {
    const { owner, friend } = await wall();
    await nail(owner.handle, { body: 'seen on the page' }, as(friend));
    await flushBackground();
    const seenAt = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 20));
    await nail(owner.handle, { body: 'rang afterwards' }, as(friend));
    await flushBackground();
    expect(await bell(as(owner))).toBe(2);
    expect((await markRead({ all: true, before: seenAt }, as(owner))).data.marked).toBe(1);
    expect(await bell(as(owner))).toBe(1);
  });

  it('refuses malformed bodies, too many ids, and other people’s sessions or origins', async () => {
    const me = await person('me');
    for (const body of [
      {},
      { ids: [] },
      { ids: ['nope'] },
      { ids: 'x' },
      { all: false },
      { all: 'true' },
      { all: true, before: 'yesterday' },
      { ids: Array(51).fill('00000000-0000-4000-8000-000000000000') },
    ]) {
      expect((await markRead(body, as(me))).status, JSON.stringify(body).slice(0, 40)).toBe(422);
    }
    expect((await markRead({ all: true }, {})).status).toBe(401);
    expect((await markRead({ all: true }, { ...as(me), origin: 'https://evil.example' })).status).toBe(403);
  });
});

describe('preferences', () => {
  it('start with everything on; change only what is named; drop unknown keys; refuse junk', async () => {
    const me = await person('me');
    const other = await person('other');
    expect((await getPrefs(as(me))).data.prefs).toEqual({
      posse: true,
      fence: true,
      replies: true,
      yo: true,
      whispers: true,
      tributes: true,
      townhalls: true,
    });
    expect(
      (await patchPrefs({ yo: false, extra: 1, userId: await userId(other.handle) }, as(me))).data.prefs,
    ).toEqual({
      posse: true,
      fence: true,
      replies: true,
      yo: false,
      whispers: true,
      tributes: true,
      townhalls: true,
    });
    expect((await getPrefs(as(other))).data.prefs).toEqual({
      posse: true,
      fence: true,
      replies: true,
      yo: true,
      whispers: true,
      tributes: true,
      townhalls: true,
    });
    for (const body of [{}, { yo: 'no' }, { posse: null }, { yo: 1 }]) {
      expect((await patchPrefs(body, as(me))).status, JSON.stringify(body)).toBe(422);
    }
    expect((await patchPrefs({ yo: true }, {})).status).toBe(401);
    expect((await q('select count(*)::int n from notification_prefs')).rows[0].n).toBe(1);
  });
});

describe('retention and integrity', () => {
  it('drops Chimes read over 30 days ago and unread ones over 90 days old — nothing newer', async () => {
    const me = await person('me');
    const to = await userId(me.handle);
    const mk = async (createdDaysAgo: number, readDaysAgo: number | null) => {
      const a = await insertUser('act');
      await q(
        `insert into notifications (recipient_id, actor_id, type, created_at, read_at)
         values ($1, $2, 'posse_requested', now() - $3 * interval '1 day', ${readDaysAgo === null ? 'null' : `now() - ${readDaysAgo} * interval '1 day'`})`,
        [to, a.id, createdDaysAgo],
      );
    };
    await mk(40, 31); // read long ago → gone
    await mk(40, 5); // read recently → stays
    await mk(95, null); // unread, ancient → gone
    await mk(60, null); // unread, old but under 90 → stays
    expect((await purgeOldChimes()).chimes).toBe(2);
    expect(await rows()).toBe(2);
  });

  it('the database refuses bad rows: unknown type, self, wrong card link, duplicates', async () => {
    const { owner, friend } = await wall();
    const o = await userId(owner.handle);
    const f = await userId(friend.handle);
    await nail(owner.handle, { body: 'x' }, as(owner));
    const card = (await q('select id from post_cards')).rows[0].id;
    const ins = (type: string, recipient: string, actor: string, cardId: string | null) =>
      q('insert into notifications (recipient_id, actor_id, type, card_id) values ($1, $2, $3, $4)', [
        recipient,
        actor,
        type,
        cardId,
      ]);
    await expect(ins('boom', o, f, card)).rejects.toThrow(/notifications_type_check/);
    await expect(ins('posse_requested', o, o, null)).rejects.toThrow(/notifications_not_self/);
    await expect(ins('posse_requested', o, f, card)).rejects.toThrow(/notifications_card_iff_card_type/);
    await expect(ins('yo_given', o, f, null)).rejects.toThrow(/notifications_card_iff_card_type/);
    await ins('yo_given', o, f, card);
    await expect(ins('yo_given', o, f, card)).rejects.toThrow(/notifications_once_per_card/);
    await ins('posse_requested', o, f, null);
    await expect(ins('posse_requested', o, f, null)).rejects.toThrow(/notifications_once_per_person/);
  });
});
