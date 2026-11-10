import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { RATE } from '@/modules/fence/service';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { editOf, fenceOf, nail, pinOf, waiting } from '../helpers/fence';
import { patchRanch } from '../helpers/ranch';
import { doAct, q } from '../helpers/social';

/** ADR-063: a writer may change the words of their own post; readers see "Edited". */

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

async function cardOn(wall: P, writer: P, body: string) {
  const made = await nail(wall.handle, { body }, as(writer));
  expect(made.status).toBe(201);
  return made.data.card!;
}

describe('who may edit', () => {
  it('the writer changes the words; everyone then reads the new words marked as edited', async () => {
    const me = await person('me');
    const friend = await person('friend');
    await friends(me, friend);
    const card = await cardOn(me, me, 'Helo everyone');
    expect(card).toMatchObject({ canEdit: true, editedAt: null });

    const res = await editOf(card.id, { body: 'Hello everyone' }, as(me));
    expect(res.status).toBe(200);
    expect(res.data.card).toMatchObject({ id: card.id, body: 'Hello everyone', canEdit: true });
    expect(res.data.card!.editedAt).not.toBeNull();

    const seen = (await fenceOf(me.handle, as(friend))).data.cards!.find((c) => c.id === card.id)!;
    expect(seen).toMatchObject({ body: 'Hello everyone', canEdit: false });
    expect(seen.editedAt).not.toBeNull();
  });

  it('nobody else may edit, not even the wall owner, and they get the same 404 as a missing post', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await friends(owner, friend);
    const card = await cardOn(owner, friend, 'My words');
    const missing = await editOf('00000000-0000-4000-8000-000000000000', { body: 'x' }, as(owner));
    expect(missing.status).toBe(404);
    for (const who of [owner, stranger]) {
      const res = await editOf(card.id, { body: 'Not your words' }, as(who));
      expect(res.status).toBe(404);
      expect(res.data.error!.message).toBe(missing.data.error!.message);
    }
    expect((await editOf(card.id, { body: 'x' }, {})).status).toBe(401);
    expect((await q('select body from post_cards where id = $1', [card.id])).rows[0].body).toBe('My words');
  });

  it('a writer the owner has since blocked can no longer change their post on that wall', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await friends(owner, friend);
    const card = await cardOn(owner, friend, 'Before the block');
    await doAct(friend.handle, 'block', as(owner));
    expect((await editOf(card.id, { body: 'After the block' }, as(friend))).status).toBe(404);
  });
});

describe('the words get the same checks as a new post', () => {
  it('links, too-long and empty words are refused; 500 characters fit', async () => {
    const me = await person('me');
    const card = await cardOn(me, me, 'Plain words');
    expect((await editOf(card.id, { body: 'see https://example.com' }, as(me))).status).toBe(422);
    expect((await editOf(card.id, { body: 'x'.repeat(501) }, as(me))).status).toBe(422);
    const empty = await editOf(card.id, { body: '   ' }, as(me));
    expect(empty.status).toBe(422);
    expect(empty.data.error!.fields!.body).toBe('Write something or add a photo.');
    expect((await editOf(card.id, { body: 'x'.repeat(500) }, as(me))).status).toBe(200);
  });

  it('extra fields cannot change the status or the time', async () => {
    const me = await person('me');
    const card = await cardOn(me, me, 'Mine');
    await editOf(
      card.id,
      { body: 'Still mine', status: 'held', authorId: 'x', createdAt: '2000-01-01', editedAt: null },
      as(me),
    );
    const row = (await q('select status, created_at from post_cards where id = $1', [card.id])).rows[0];
    expect(row.status).toBe('published');
    expect(new Date(row.created_at).getFullYear()).toBeGreaterThan(2000);
  });

  it('saving the same words changes nothing (no "Edited" for a no-op)', async () => {
    const me = await person('me');
    const card = await cardOn(me, me, 'Same');
    const res = await editOf(card.id, { body: 'Same' }, as(me));
    expect(res.status).toBe(200);
    expect(res.data.card!.editedAt).toBeNull();
  });
});

describe('approved words cannot be swapped for ones the owner never saw', () => {
  it('with Review on, an edited post on someone else’s wall waits for the owner again and loses its pin', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const other = await person('other');
    await friends(owner, friend);
    await friends(owner, other);
    const card = await cardOn(owner, friend, 'Nice and friendly');
    expect((await pinOf(card.id, true, as(owner))).status).toBe(200);
    await patchRanch({ fenceReview: true }, as(owner));

    const res = await editOf(card.id, { body: 'Something else entirely' }, as(friend));
    expect(res.status).toBe(200);
    expect(res.data.card).toMatchObject({ waiting: true, body: 'Something else entirely' });
    expect((await fenceOf(owner.handle, as(other))).data.cards!.map((c) => c.id)).not.toContain(card.id);
    expect(
      (await q('select pinned_at from post_cards where id = $1', [card.id])).rows[0].pinned_at,
    ).toBeNull();
    expect(JSON.stringify((await waiting(as(owner))).data)).toContain('Something else entirely');
  });

  it('the owner editing their own post on their own wall never waits', async () => {
    const owner = await person('owner');
    await patchRanch({ fenceReview: true }, as(owner));
    const card = await cardOn(owner, owner, 'Mine');
    const res = await editOf(card.id, { body: 'Mine, edited' }, as(owner));
    expect(res.data.card).toMatchObject({ waiting: false, body: 'Mine, edited' });
  });

  it('a restricted writer’s edit is held without being told: it looks saved to them, gone for everyone else', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const other = await person('other');
    await friends(owner, friend);
    await friends(owner, other);
    const card = await cardOn(owner, friend, 'Before');
    await doAct(friend.handle, 'restrict', as(owner));
    const res = await editOf(card.id, { body: 'After' }, as(friend));
    expect(res.data.card).toMatchObject({ waiting: false, body: 'After' });
    expect((await fenceOf(owner.handle, as(other))).data.cards!.map((c) => c.id)).not.toContain(card.id);
  });
});

describe('rate limit', () => {
  it(`at most ${RATE.edit.limit} edits an hour per person, then a 429`, async () => {
    const me = await person('me');
    const card = await cardOn(me, me, 'v0');
    for (let i = 1; i <= RATE.edit.limit; i++) {
      expect((await editOf(card.id, { body: `v${i}` }, as(me))).status).toBe(200);
    }
    expect((await editOf(card.id, { body: 'one more' }, as(me))).status).toBe(429);
  });
});
