import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mayViewRanchByHandle } from '@/modules/profiles';
import { getTownHall, mayOpenTownHall } from '@/modules/town-halls';
import { mayOpenThread } from '@/modules/whispers';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { subscribe, type DomainEvent } from '@/platform/events';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { patchRanch, viewRanch } from '../helpers/ranch';
import { doAct, q, userId } from '../helpers/social';
import { create, invite } from '../helpers/town-halls';

/**
 * The page gates run in layouts, BEFORE a loading outline streams, so a hidden page answers a real 404. They must agree
 * with the pages' own checks, and — because layouts also run for link prefetches — must not have side effects.
 */
let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

// Settled accounts: these tests are about everyone's rules, not the first-week budgets (ADR-024).
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
type P = Awaited<ReturnType<typeof person>>;
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

describe('the Porch gate', () => {
  it('agrees with the page: members-only is open to members, pals-only only to Pals, missing and malformed are closed', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await pals(owner, friend);
    const s = await userId(stranger.handle);
    const f = await userId(friend.handle);

    expect(await mayViewRanchByHandle(s, owner.handle)).toBe(true); // members-only by default
    await patchRanch({ ranchVisibility: 'posse', signalVisibility: 'posse' }, as(owner));
    expect(await mayViewRanchByHandle(s, owner.handle)).toBe(false);
    expect((await viewRanch(owner.handle, as(stranger))).status).toBe(404); // …the same answer as the page's API
    expect(await mayViewRanchByHandle(f, owner.handle)).toBe(true);
    expect(await mayViewRanchByHandle(s, owner.handle.toUpperCase())).toBe(false);
    expect(await mayViewRanchByHandle(s, 'nobody_home')).toBe(false);
    expect(await mayViewRanchByHandle(s, '../etc')).toBe(false);
    await q("update users set status = 'suspended' where handle = $1", [friend.handle]);
    expect(await mayViewRanchByHandle(s, friend.handle)).toBe(false);
  });

  it('a block closes it both ways', async () => {
    const a = await person('blocker');
    const b = await person('blocked');
    await doAct(b.handle, 'block', as(a));
    expect(await mayViewRanchByHandle(await userId(b.handle), a.handle)).toBe(false);
    expect(await mayViewRanchByHandle(await userId(a.handle), b.handle)).toBe(false);
  });

  it('records no visit (prefetches run it too): no event, no Track', async () => {
    const owner = await person('owner');
    const visitor = await person('visitor');
    const seen: DomainEvent[] = [];
    const stop = subscribe(async (e) => {
      seen.push(e);
    });
    try {
      expect(await mayViewRanchByHandle(await userId(visitor.handle), owner.handle)).toBe(true);
      await flushBackground();
    } finally {
      stop();
    }
    expect(seen.filter((e) => e.type === 'ranch.visited')).toEqual([]);
    expect((await q('select count(*)::int n from tracks')).rows[0].n).toBe(0);
  });
});

describe('the Whisper thread gate', () => {
  it('open only between Pals; closed for strangers, blocks, yourself and made-up call signs', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const c = await person('carol');
    await pals(a, b);
    const ida = await userId(a.handle);
    expect(await mayOpenThread(ida, b.handle)).toBe(true);
    expect(await mayOpenThread(ida, c.handle)).toBe(false);
    expect(await mayOpenThread(ida, a.handle)).toBe(false);
    expect(await mayOpenThread(ida, 'nobody_home')).toBe(false);
    await doAct(a.handle, 'block', as(b));
    expect(await mayOpenThread(ida, b.handle)).toBe(false);
  });
});

describe('the Town Hall gate', () => {
  it('open and members Town Halls are open; invite-only only with an invite or membership; bad ids are closed, not errors', async () => {
    const owner = await person('owner');
    const guest = await person('guest');
    const outsider = await person('outsider');
    const open = (await create({ name: 'Open hall', description: 'Anyone', visibility: 'open' }, as(owner)))
      .data.townHall!.id;
    const secret = (
      await create({ name: 'Secret hall', description: 'Invite only', visibility: 'invite' }, as(owner))
    ).data.townHall!.id;
    await invite(secret, guest.handle, as(owner));
    const out = await userId(outsider.handle);

    expect(await mayOpenTownHall(out, open)).toBe(true);
    expect(await mayOpenTownHall(out, secret)).toBe(false);
    expect(await mayOpenTownHall(await userId(guest.handle), secret)).toBe(true); // invited: may see it to answer
    expect(await mayOpenTownHall(await userId(owner.handle), secret)).toBe(true);
    expect(await mayOpenTownHall(out, '00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(await mayOpenTownHall(out, 'not-a-uuid')).toBe(false);
    // The page itself renders alongside its gate, so its own read must also treat a bad id as missing, not throw.
    expect(await getTownHall(out, 'not-a-uuid')).toBeNull();
  });
});
