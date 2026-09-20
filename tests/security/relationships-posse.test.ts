import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { relationshipOf } from '@/modules/relationships';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { patchRanch, setSignal, viewRanch } from '../helpers/ranch';
import { NONE, doAct, myLists, q, relWith, userId } from '../helpers/social';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });

describe('the Posse handshake', () => {
  it('a request is private: the asker sees "sent", the asked sees "received", strangers see nothing', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const c = await person('carol');
    expect((await doAct(b.handle, 'request', as(a))).data.relationship).toMatchObject({
      ...NONE,
      posse: 'sent',
    });
    expect((await relWith(a.handle, as(b))).data.relationship).toMatchObject({ posse: 'received' });
    expect((await relWith(a.handle, as(c))).data.relationship).toMatchObject(NONE);

    const bLists = (await myLists(as(b))).data as {
      incoming: { handle: string; displayName: string }[];
      outgoing: unknown[];
    };
    expect(bLists.incoming.map((p) => p.handle)).toEqual([a.handle]);
    expect((await myLists(as(a))).data.outgoing).toEqual([expect.objectContaining({ handle: b.handle })]);
    expect((await myLists(as(c))).data.incoming).toEqual([]);
  });

  it('accepting makes a mutual Posse, in both directions', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    expect((await doAct(a.handle, 'accept', as(b))).data.relationship).toMatchObject({ posse: 'member' });
    expect((await relWith(b.handle, as(a))).data.relationship).toMatchObject({ posse: 'member' });
    expect(await relationshipOf(await userId(a.handle), await userId(b.handle))).toBe('POSSE');
    expect(await relationshipOf(await userId(b.handle), await userId(a.handle))).toBe('POSSE');
    expect(((await myLists(as(a))).data.posse as { handle: string }[]).map((p) => p.handle)).toEqual([
      b.handle,
    ]);
    expect(((await myLists(as(b))).data.posse as { handle: string }[]).map((p) => p.handle)).toEqual([
      a.handle,
    ]);
  });

  it('asking someone who already asked you simply agrees (mutual requests become a Posse)', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    expect((await doAct(a.handle, 'request', as(b))).data.relationship).toMatchObject({ posse: 'member' });
  });

  it('everything is idempotent: asking twice, accepting twice', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    expect((await doAct(b.handle, 'request', as(a))).status).toBe(200);
    expect((await q('select count(*)::int n from posse_links')).rows[0].n).toBe(1);
    await doAct(a.handle, 'accept', as(b));
    expect((await doAct(a.handle, 'accept', as(b))).data.relationship).toMatchObject({ posse: 'member' });
  });

  it('only the person who was asked can answer, and only a live request', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const c = await person('carol');
    await doAct(b.handle, 'request', as(a));
    // the asker cannot accept their own request; a third party cannot answer someone else's; nothing to accept otherwise
    expect((await doAct(b.handle, 'accept', as(a))).status).toBe(404);
    expect((await doAct(a.handle, 'accept', as(c))).status).toBe(404);
    expect((await doAct(a.handle, 'decline', as(c))).status).toBe(404);
    expect((await doAct(c.handle, 'accept', as(b))).status).toBe(404);
    expect((await relWith(b.handle, as(a))).data.relationship).toMatchObject({ posse: 'sent' }); // unchanged
  });

  it('the asker can withdraw a pending request; either side can leave a Posse', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    expect((await doAct(b.handle, 'cancel', as(a))).data.relationship).toMatchObject(NONE);
    expect((await q('select count(*)::int n from posse_links')).rows[0].n).toBe(0);

    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'accept', as(b));
    expect((await doAct(a.handle, 'leave', as(b))).data.relationship).toMatchObject(NONE); // the OTHER side can leave too
    expect((await relWith(b.handle, as(a))).data.relationship).toMatchObject(NONE);
    expect((await doAct(a.handle, 'leave', as(b))).status).toBe(200); // idempotent
  });
});

describe('a declined request is silent — and cannot be used to badger someone', () => {
  it('the asker is never told; the decliner sees nothing pending', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'decline', as(b));
    expect((await relWith(b.handle, as(a))).data.relationship).toMatchObject({ posse: 'sent' }); // looks exactly like pending
    expect((await relWith(a.handle, as(b))).data.relationship).toMatchObject(NONE);
    expect((await myLists(as(b))).data.incoming).toEqual([]);
    expect((await myLists(as(a))).data.outgoing).toEqual([expect.objectContaining({ handle: b.handle })]);
  });

  it('asking again within 30 days "works" but changes nothing; after the cooldown it does', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'decline', as(b));

    expect((await doAct(b.handle, 'request', as(a))).status).toBe(200);
    expect((await myLists(as(b))).data.incoming).toEqual([]); // still nothing for the decliner
    expect((await q('select status from posse_links')).rows[0].status).toBe('declined');

    await q("update posse_links set responded_at = now() - interval '31 days'");
    await doAct(b.handle, 'request', as(a));
    expect((await q('select status from posse_links')).rows[0].status).toBe('requested');
    expect((await myLists(as(b))).data.incoming).toEqual([expect.objectContaining({ handle: a.handle })]);
  });

  it('cancelling a declined request does not clear the cooldown', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'decline', as(b));
    await doAct(b.handle, 'cancel', as(a));
    expect((await q('select count(*)::int n from posse_links')).rows[0].n).toBe(1);
    await doAct(b.handle, 'request', as(a));
    expect((await myLists(as(b))).data.incoming).toEqual([]);
  });

  it('the person who declined can still ask the other person themselves', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'decline', as(b));
    await doAct(a.handle, 'request', as(b)); // Bob changed his mind
    expect((await relWith(b.handle, as(a))).data.relationship).toMatchObject({ posse: 'received' });
  });
});

describe('“posse” visibility now works end to end (the Phase 3 stub is gone)', () => {
  it('a Posse member can open a posse-only Ranch and read a posse-only Signal; strangers and signed-out visitors cannot', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await patchRanch({ ranchVisibility: 'posse', signalVisibility: 'posse' }, as(owner));
    await setSignal('Only for my Posse', as(owner));

    expect((await viewRanch(owner.handle, as(friend))).status).toBe(404); // not in the Posse yet
    await doAct(owner.handle, 'request', as(friend));
    await doAct(friend.handle, 'accept', as(owner));

    const seen = await viewRanch(owner.handle, as(friend));
    expect(seen.status).toBe(200);
    expect(seen.data.ranch).toMatchObject({ signal: { text: 'Only for my Posse' } });
    expect((await viewRanch(owner.handle, as(stranger))).status).toBe(404);
    expect((await viewRanch(owner.handle)).status).toBe(404);
  });

  it('leaving the Posse takes the access away immediately', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await patchRanch({ ranchVisibility: 'posse' }, as(owner));
    await doAct(owner.handle, 'request', as(friend));
    await doAct(friend.handle, 'accept', as(owner));
    expect((await viewRanch(owner.handle, as(friend))).status).toBe(200);
    await doAct(friend.handle, 'leave', as(owner));
    expect((await viewRanch(owner.handle, as(friend))).status).toBe(404);
  });

  it('a pending request grants nothing, and a declined one grants nothing', async () => {
    const owner = await person('owner');
    const asker = await person('asker');
    await patchRanch({ ranchVisibility: 'posse' }, as(owner));
    await doAct(owner.handle, 'request', as(asker));
    expect((await viewRanch(owner.handle, as(asker))).status).toBe(404);
    await doAct(asker.handle, 'decline', as(owner));
    expect((await viewRanch(owner.handle, as(asker))).status).toBe(404);
  });

  it('“members only” Ranches are unaffected by relationships (any signed-in person still sees them)', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    expect((await viewRanch(owner.handle, as(stranger))).status).toBe(200);
  });
});

describe('Close Posse is private', () => {
  it('marking someone close changes only how YOU regard them, and the other person cannot tell', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'accept', as(b));
    const aId = await userId(a.handle);
    const bId = await userId(b.handle);

    expect((await doAct(b.handle, 'close', as(a))).data.relationship).toMatchObject({
      posse: 'member',
      closeByMe: true,
    });
    expect(await relationshipOf(aId, bId)).toBe('CLOSE_POSSE'); // Alice's regard of Bob
    expect(await relationshipOf(bId, aId)).toBe('POSSE'); // Bob's regard of Alice is unchanged
    const bobsView = (await relWith(a.handle, as(b))).data;
    expect(bobsView.relationship).toMatchObject({ posse: 'member', closeByMe: false });
    expect(JSON.stringify(bobsView)).not.toMatch(/close.*true/i);

    expect((await doAct(b.handle, 'unclose', as(a))).data.relationship).toMatchObject({ closeByMe: false });
  });

  it('needs an existing Posse, and ends with it', async () => {
    const a = await person('alice');
    const b = await person('bob');
    expect((await doAct(b.handle, 'close', as(a))).status).toBe(404);
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'accept', as(b));
    await doAct(b.handle, 'close', as(a));
    await doAct(b.handle, 'leave', as(a));
    expect((await q('select count(*)::int n from posse_links')).rows[0].n).toBe(0);
  });
});

describe('Scouting is one-way and grants nothing', () => {
  it('needs the right to see the Ranch; nothing is stored otherwise', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await patchRanch({ ranchVisibility: 'posse' }, as(b));
    expect((await doAct(b.handle, 'scout', as(a))).status).toBe(404);
    expect((await q('select count(*)::int n from scouts')).rows[0].n).toBe(0);
  });

  it('scouting a visible Ranch works, is private to the scout, and never unlocks anything', async () => {
    const a = await person('alice');
    const b = await person('bob');
    expect((await doAct(b.handle, 'scout', as(a))).data.relationship).toMatchObject({ scouting: true });
    expect(await relationshipOf(await userId(b.handle), await userId(a.handle))).toBe('SCOUTING');
    // Bob cannot see that Alice scouts him
    expect(JSON.stringify((await relWith(a.handle, as(b))).data)).not.toContain('true');
    expect((await myLists(as(b))).data.scouting).toEqual([]);
    // ...and scouting does not open a posse-only Ranch
    await patchRanch({ ranchVisibility: 'posse' }, as(b));
    expect((await viewRanch(b.handle, as(a))).status).toBe(404);
    // stop
    expect((await doAct(b.handle, 'unscout', as(a))).data.relationship).toMatchObject({ scouting: false });
  });
});

describe('Mute and Restrict limit interaction, not who may look', () => {
  it('muting or restricting someone never hides the Ranch from them, and they are never told', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'mute', as(a));
    await doAct(b.handle, 'restrict', as(a));
    const aId = await userId(a.handle);
    const bId = await userId(b.handle);
    expect(await relationshipOf(aId, bId)).toBe('RESTRICTED'); // Alice's regard of Bob (restrict outranks mute)
    expect((await viewRanch(a.handle, as(b))).status).toBe(200); // Bob still sees Alice's Ranch
    expect((await relWith(a.handle, as(b))).data.relationship).toMatchObject(NONE); // and nothing reveals it
    expect((await relWith(b.handle, as(a))).data.relationship).toMatchObject({
      muted: true,
      restricted: true,
    });
    await doAct(b.handle, 'unmute', as(a));
    await doAct(b.handle, 'unrestrict', as(a));
    expect((await relWith(b.handle, as(a))).data.relationship).toMatchObject(NONE);
  });

  it('a muted or restricted Posse member keeps their Posse access', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await patchRanch({ ranchVisibility: 'posse' }, as(owner));
    await doAct(owner.handle, 'request', as(friend));
    await doAct(friend.handle, 'accept', as(owner));
    await doAct(friend.handle, 'mute', as(owner));
    await doAct(friend.handle, 'restrict', as(owner));
    expect(await relationshipOf(await userId(owner.handle), await userId(friend.handle))).toBe('POSSE');
    expect((await viewRanch(owner.handle, as(friend))).status).toBe(200);
  });
});

describe('you can only ever act as yourself', () => {
  it('unblocking (or any undo) affects only the caller’s own controls', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const c = await person('carol');
    await doAct(c.handle, 'block', as(b)); // Bob blocked Carol
    await doAct(c.handle, 'unblock', as(a)); // Alice "unblocks" Carol: no effect on Bob's block
    expect((await q('select count(*)::int n from user_controls where kind = $1', ['block'])).rows[0].n).toBe(
      1,
    );
    expect((await viewRanch(b.handle, as(c))).status).toBe(404);
  });

  it('the lists endpoint only ever returns the caller’s own relationships', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const c = await person('carol');
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'accept', as(b));
    expect((await myLists(as(c))).data).toMatchObject({
      posse: [],
      incoming: [],
      outgoing: [],
      scouting: [],
      blocked: [],
    });
    const own = (await myLists(as(a))).data;
    expect(JSON.stringify(own)).not.toContain(c.handle);
    expect(Object.keys((own.posse as object[])[0] as object).sort()).toEqual([
      'at',
      'closeByMe',
      'displayName',
      'handle',
      'portraitTint',
    ]); // no ids, no emails
  });

  it('acting on yourself is refused; unknown people are a plain 404', async () => {
    const a = await person('alice');
    expect((await doAct(a.handle, 'request', as(a))).status).toBe(400); // "you cannot do that to yourself"
    expect((await relWith(a.handle, as(a))).status).toBe(404); // reading a relationship with yourself: nothing to show
    expect((await q('select count(*)::int n from posse_links')).rows[0].n).toBe(0);
    expect((await doAct('nobody_home', 'request', as(a))).status).toBe(404);
    expect((await doAct('../etc/passwd', 'request', as(a))).status).toBe(404);
    expect(stable((await doAct('nobody_home', 'request', as(a))).data)).toBe(
      stable((await doAct('also_nobody', 'request', as(a))).data),
    );
  });

  it('unknown actions and malformed bodies are rejected before anything runs', async () => {
    const a = await person('alice');
    const b = await person('bob');
    for (const action of ['befriend', 'REQUEST', '', 42, null, { x: 1 }, 'request; drop table users']) {
      expect((await doAct(b.handle, action, as(a))).status, JSON.stringify(action)).toBe(422);
    }
    expect((await q('select count(*)::int n from posse_links')).rows[0].n).toBe(0);
  });

  it('every endpoint refuses signed-out callers, and cross-site requests change nothing (CSRF)', async () => {
    const a = await person('alice');
    const b = await person('bob');
    expect((await doAct(b.handle, 'request')).status).toBe(401);
    expect((await relWith(b.handle)).status).toBe(401);
    expect((await myLists()).status).toBe(401);
    const forged = await doAct(b.handle, 'request', { cookie: a.cookie, origin: 'https://evil.example' });
    expect(forged.status).toBe(403);
    expect((await q('select count(*)::int n from posse_links')).rows[0].n).toBe(0);
  });

  it('a suspended person cannot be asked, listed or found', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await q("update users set status = 'suspended' where handle = $1", [b.handle]);
    expect((await doAct(b.handle, 'request', as(a))).status).toBe(404);
    expect((await myLists(as(a))).data.outgoing).toEqual([]); // their card is gone, so is the entry
  });
});
