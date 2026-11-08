import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '@/modules/authz';
import { getFenceCard } from '@/modules/fence';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { nail } from '../helpers/fence';
import { patchRanch } from '../helpers/ranch';
import { doAct, userId } from '../helpers/social';

/**
 * A post on its own page (where notifications lead, 2026-11-08) must never show more than the wall would: the same
 * reader rules, the same "someone else's waiting post is invisible", the same blocks; and missing looks like hidden.
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
const actor = async (p: P): Promise<Actor> => ({
  kind: 'user',
  id: await userId(p.handle),
  status: 'active',
});
const open = async (viewer: P, handle: string, id: string) =>
  getFenceCard(await actor(viewer), handle, id, { rateKey: `t:${viewer.handle}` });

async function posse(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

describe('a post on its own page', () => {
  it('shows exactly that post, to someone who may read the wall', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await posse(owner, friend);
    await nail(owner.handle, { body: 'older' }, as(owner));
    const id = (await nail(owner.handle, { body: 'this one' }, as(owner))).data.card!.id;
    const page = await open(friend, owner.handle, id);
    expect(page?.cards.map((c) => c.body)).toEqual(['this one']);
    expect(page?.nextCursor).toBeNull();
  });

  it('is not found under another wall, for a bad id, or for a post that does not exist', async () => {
    const owner = await person('owner');
    const other = await person('other');
    const id = (await nail(owner.handle, { body: 'mine' }, as(owner))).data.card!.id;
    expect(await open(owner, other.handle, id)).toBeNull();
    expect(await open(owner, owner.handle, 'not-a-uuid')).toBeNull();
    expect(await open(owner, owner.handle, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('is hidden from someone the wall is hidden from (friends-only wall)', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    await patchRanch({ fenceVisibility: 'posse' }, as(owner));
    const id = (await nail(owner.handle, { body: 'friends only' }, as(owner))).data.card!.id;
    expect(await open(stranger, owner.handle, id)).toBeNull();
  });

  it('is hidden from someone blocked by the owner', async () => {
    const owner = await person('owner');
    const villain = await person('villain');
    await patchRanch({ ranchVisibility: 'everyone', fenceVisibility: 'everyone' }, as(owner));
    const id = (await nail(owner.handle, { body: 'not for you' }, as(owner))).data.card!.id;
    expect(await open(villain, owner.handle, id)).not.toBeNull();
    await doAct(villain.handle, 'block', as(owner));
    expect(await open(villain, owner.handle, id)).toBeNull();
  });

  it('a post waiting for approval is seen by its writer only', async () => {
    const owner = await person('owner');
    const writer = await person('writer');
    const third = await person('third');
    await posse(owner, writer);
    await posse(owner, third);
    await patchRanch({ fenceReview: true }, as(owner));
    const card = (await nail(owner.handle, { body: 'please approve' }, as(writer))).data.card!;
    expect(card.waiting).toBe(true);
    expect((await open(writer, owner.handle, card.id))?.cards[0]?.waiting).toBe(true);
    expect(await open(third, owner.handle, card.id)).toBeNull();
  });
});
