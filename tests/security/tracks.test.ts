import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bucketOf, purgeOldTracks, recordVisit } from '@/modules/tracks';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { subscribe } from '@/platform/events';
import { freshAuthState, signedInUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { patchRanch, viewRanch } from '../helpers/ranch';
import { doAct, insertUser, q, userId } from '../helpers/social';
import { myTracks, names } from '../helpers/tracks';

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
const rows = async () => (await q('select * from tracks order by seen_on')).rows;
const count = async () => (await q('select count(*)::int n from tracks')).rows[0].n as number;

async function posse(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
/** `visitor` opens `owner`'s Ranch (an "everyone" Ranch, so anyone signed in can look). */
async function visit(visitor: P, owner: P) {
  const r = await viewRanch(owner.handle, as(visitor));
  await flushBackground();
  return r;
}
async function open(p: P) {
  await patchRanch({ ranchVisibility: 'everyone' }, as(p));
}
const ageTo = (owner: string, visitor: string, days: number) =>
  q(
    `update tracks set seen_on = (now() at time zone 'utc')::date - $3::int where owner_id = $1 and visitor_id = $2`,
    [owner, visitor, days],
  );

describe('the coarse "when"', () => {
  it('is only ever Today, Yesterday or This week', () => {
    expect([0, 1, 2, 3, 6].map(bucketOf)).toEqual([
      'today',
      'yesterday',
      'this-week',
      'this-week',
      'this-week',
    ]);
    expect(bucketOf(-1)).toBe('today');
  });
});

describe('what is recorded — and how little', () => {
  it('a signed-in person opening someone’s Ranch leaves one row: two ids and a UTC DATE, nothing else', async () => {
    const owner = await person('owner');
    const v = await person('visitor');
    await open(owner);
    expect((await visit(v, owner)).status).toBe(200);
    const [row] = await rows();
    expect(Object.keys(row).sort()).toEqual(['owner_id', 'seen_on', 'visitor_id']);
    expect(row.owner_id).toBe(await userId(owner.handle));
    expect(row.visitor_id).toBe(await userId(v.handle));
    // A date column: the database itself cannot hold a time of day for a visit.
    const col = (
      await q(
        "select data_type from information_schema.columns where table_name = 'tracks' and column_name = 'seen_on'",
      )
    ).rows[0];
    expect(col.data_type).toBe('date');
    const cols = (
      await q("select column_name from information_schema.columns where table_name = 'tracks'")
    ).rows.map((c) => c.column_name);
    expect(cols.sort()).toEqual(['owner_id', 'seen_on', 'visitor_id']);
  });

  it('many visits in a day are ONE row, and repeats do not even write to it', async () => {
    const owner = await person('owner');
    const v = await person('visitor');
    await open(owner);
    await visit(v, owner);
    const before = (await q('select xmin::text x from tracks')).rows[0].x;
    for (let i = 0; i < 5; i++) await visit(v, owner);
    expect(await count()).toBe(1);
    expect((await q('select xmin::text x from tracks')).rows[0].x).toBe(before); // same row version: nothing was rewritten
  });

  it('a visit on a later day moves the date forward — still one row', async () => {
    const owner = await person('owner');
    const v = await person('visitor');
    await open(owner);
    await visit(v, owner);
    await ageTo(await userId(owner.handle), await userId(v.handle), 3);
    await visit(v, owner);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(
      (await q("select ((now() at time zone 'utc')::date - seen_on)::int d from tracks")).rows[0].d,
    ).toBe(0);
  });

  it('nothing is recorded for: yourself, signed-out visitors, a Ranch you cannot open, a missing person, or a suspended owner', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    const gone = await person('gone');
    await patchRanch({ ranchVisibility: 'everyone' }, as(gone));
    await visit(owner, owner); // own Ranch
    expect((await viewRanch(owner.handle)).status).toBe(404); // members-only, signed out
    await patchRanch({ ranchVisibility: 'everyone' }, as(owner));
    expect((await viewRanch(owner.handle)).status).toBe(200); // signed out, public
    await flushBackground();
    await patchRanch({ ranchVisibility: 'posse' }, as(owner));
    expect((await visit(stranger, owner)).status).toBe(404); // not allowed in
    expect((await visit(stranger, { handle: 'nobody_here' } as P)).status).toBe(404);
    await q("update users set status = 'suspended' where handle = $1", [gone.handle]);
    expect((await visit(stranger, gone)).status).toBe(404);
    expect(await count()).toBe(0);
  });

  it('a person in a block with the owner leaves nothing — either way round — even if the recorder is called directly', async () => {
    const owner = await person('owner');
    const v = await person('visitor');
    await open(owner);
    await doAct(v.handle, 'block', as(owner));
    expect((await visit(v, owner)).status).toBe(404);
    await recordVisit(await userId(v.handle), await userId(owner.handle)); // defence in depth
    await doAct(v.handle, 'unblock', as(owner));
    await doAct(owner.handle, 'block', as(v));
    await recordVisit(await userId(v.handle), await userId(owner.handle));
    expect(await count()).toBe(0);
  });

  it('the recorder itself refuses yourself and inactive accounts (it never leans on the database to say no)', async () => {
    const owner = await person('owner');
    const v = await person('visitor');
    const o = await userId(owner.handle);
    const w = await userId(v.handle);
    await expect(recordVisit(o, o)).resolves.toBeUndefined();
    await q("update users set status = 'suspended' where handle = $1", [v.handle]);
    await recordVisit(w, o); // a suspended visitor
    await q("update users set status = 'active' where handle = $1", [v.handle]);
    await q("update users set status = 'suspended' where handle = $1", [owner.handle]);
    await recordVisit(w, o); // a suspended owner
    expect(await count()).toBe(0);
  });

  it('Shadow Walk: my visits leave no Track — and the owner cannot tell a shadowed visit from no visit', async () => {
    const owner = await person('owner');
    const shadow = await person('shadow');
    const normal = await person('normal');
    await open(owner);
    await patchRanch({ shadowWalk: true }, as(shadow));
    const a = await visit(shadow, owner);
    const b = await visit(normal, owner);
    expect(await count()).toBe(1); // only the ordinary visit
    // The visitor's own experience is byte-for-byte the same either way.
    expect(stable(a.data)).toBe(stable(b.data));
    expect(await names(as(owner))).toEqual([]); // (neither is in the Posse: only counted)
    expect((await myTracks(as(owner))).data.hidden).toEqual({ today: 1, yesterday: 0, 'this-week': 0 });
  });

  it('the visitor’s response never depends on recording: a failing listener changes nothing', async () => {
    const owner = await person('owner');
    const v = await person('visitor');
    await open(owner);
    const good = await viewRanch(owner.handle, as(v));
    const stop = subscribe(async () => {
      throw new Error('listener exploded');
    });
    const withBadListener = await viewRanch(owner.handle, as(v));
    await flushBackground();
    stop();
    expect(withBadListener.status).toBe(200);
    expect(stable(withBadListener.data)).toBe(stable(good.data));
  });

  it('nothing but the Ranch page triggers a visit: lists, Posse pages and my own lookups leave no Track', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await posse(a, b);
    const { myLists } = await import('../helpers/social');
    await myLists(as(a));
    await myTracks(as(a));
    await flushBackground();
    expect(await count()).toBe(0);
  });
});

describe('who is named — decided when the list is read', () => {
  it('Posse visitors are named with a coarse day; everyone else is only a count; nothing about hidden people leaks', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await open(owner);
    await posse(owner, friend);
    await visit(friend, owner);
    await visit(stranger, owner);
    const t = await myTracks(as(owner));
    expect(t.data.people).toEqual([
      { handle: friend.handle, displayName: friend.handle, portraitTint: expect.any(String), when: 'today' },
    ]);
    expect(t.data.hidden).toEqual({ today: 1, yesterday: 0, 'this-week': 0 });
    expect(t.text).not.toContain(stranger.handle);
    expect(t.text).not.toContain(await userId(stranger.handle));
    expect(t.text).not.toMatch(/@example\.com|visitorId|owner_id|\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}/); // no ids, no emails, no timestamps
  });

  it('identity follows the Posse as it is NOW: leaving hides a name (it becomes a count), joining reveals it', async () => {
    const owner = await person('owner');
    const v = await person('visitor');
    await open(owner);
    await visit(v, owner);
    expect((await myTracks(as(owner))).data.hidden!.today).toBe(1);
    await posse(owner, v);
    const named = await myTracks(as(owner));
    expect(named.data.people!.map((p) => p.handle)).toEqual([v.handle]);
    expect(named.data.hidden!.today).toBe(0);
    await doAct(v.handle, 'leave', as(owner));
    const again = await myTracks(as(owner));
    expect(again.data.people).toEqual([]);
    expect(again.data.hidden!.today).toBe(1);
  });

  it('people I muted or blocked (or who blocked me) vanish completely — not shown, not counted; unmuting brings them back', async () => {
    const owner = await person('owner');
    const muted = await person('muted');
    const blocked = await person('blocked');
    const blockedMe = await person('blockedme');
    const ok = await person('ok');
    await open(owner);
    for (const p of [muted, blocked, blockedMe, ok]) await visit(p, owner);
    await doAct(muted.handle, 'mute', as(owner));
    await doAct(blocked.handle, 'block', as(owner)); // past visits are removed from view silently
    await doAct(owner.handle, 'block', as(blockedMe));
    expect((await myTracks(as(owner))).data.hidden).toEqual({ today: 1, yesterday: 0, 'this-week': 0 }); // only `ok`
    await doAct(muted.handle, 'unmute', as(owner));
    expect((await myTracks(as(owner))).data.hidden!.today).toBe(2);
  });

  it('inactive accounts disappear; a restricted visitor is treated like anyone else', async () => {
    const owner = await person('owner');
    const gone = await person('gone');
    const restricted = await person('restricted');
    await open(owner);
    await visit(gone, owner);
    await visit(restricted, owner);
    await q("update users set status = 'suspended' where handle = $1", [gone.handle]);
    await doAct(restricted.handle, 'restrict', as(owner));
    expect((await myTracks(as(owner))).data.hidden!.today).toBe(1);
  });

  it('days: Today, Yesterday, This week, and nothing older than a week — with a stable order that is not arrival order', async () => {
    const owner = await person('owner');
    const ppl = [await person('zed'), await person('amy'), await person('mia'), await person('old')];
    await open(owner);
    for (const p of ppl) {
      await posse(owner, p);
      await visit(p, owner);
    }
    const ownerId = await userId(owner.handle);
    await ageTo(ownerId, await userId(ppl[2]!.handle), 1);
    await ageTo(ownerId, await userId(ppl[0]!.handle), 5);
    await ageTo(ownerId, await userId(ppl[3]!.handle), 7); // too old
    const t = await myTracks(as(owner));
    expect(t.data.people!.map((p) => `${p.handle}:${p.when}`)).toEqual([
      `${ppl[1]!.handle}:today`,
      `${ppl[2]!.handle}:yesterday`,
      `${ppl[0]!.handle}:this-week`,
    ]);
    // Two people on the same day are ordered by call sign, not by who came first.
    const one = await person('bbb');
    const two = await person('aaa');
    for (const p of [one, two]) {
      await posse(owner, p);
    }
    await visit(one, owner); // arrives first…
    await visit(two, owner); // …then this one
    const today = (await myTracks(as(owner))).data
      .people!.filter((p) => p.when === 'today')
      .map((p) => p.handle);
    expect(today).toEqual([...today].sort());
  });

  it('is capped at 50 named people (and the scan is bounded), newest first', async () => {
    const owner = await person('owner');
    const ownerId = await userId(owner.handle);
    for (let i = 0; i < 60; i++) {
      const v = await insertUser('vis');
      const [low, high] = ownerId < v.id ? [ownerId, v.id] : [v.id, ownerId];
      await q(
        "insert into posse_links (user_low, user_high, status, requested_by) values ($1, $2, 'accepted', $1)",
        [low, high],
      );
      await q(
        "insert into tracks (owner_id, visitor_id, seen_on) values ($1, $2, (now() at time zone 'utc')::date)",
        [ownerId, v.id],
      );
    }
    expect((await myTracks(as(owner))).data.people).toHaveLength(50);
  });
});

describe('Shadow Walk freezes my own Tracks (reciprocal)', () => {
  it('while on: nothing is shown; visits still accumulate for the week; turning it off shows them', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    await patchRanch({ shadowWalk: true }, as(owner));
    await visit(friend, owner);
    const frozen = await myTracks(as(owner));
    expect(frozen.data).toEqual({
      frozen: true,
      people: [],
      hidden: { today: 0, yesterday: 0, 'this-week': 0 },
      days: 7,
    });
    await patchRanch({ shadowWalk: false }, as(owner));
    expect((await myTracks(as(owner))).data.people!.map((p) => p.handle)).toEqual([friend.handle]);
  });

  it('the setting is private: it is validated, only ever changes the caller’s own, and no one else can see it', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await posse(a, b);
    await patchRanch({ shadowWalk: true }, as(a));
    const seenByB = await viewRanch(a.handle, as(b));
    expect(seenByB.text).not.toMatch(/shadow/i);
    expect(
      JSON.stringify(await (await import('../helpers/ranch')).myRanch(b.cookie).then((r) => r.data)),
    ).toContain('"shadowWalk":false');
    for (const bad of ['yes', 1, null]) {
      expect((await patchRanch({ shadowWalk: bad }, as(a))).status, String(bad)).toBe(422);
    }
    expect((await patchRanch({ shadowWalk: true, userId: await userId(b.handle) }, as(a))).status).toBe(200);
    expect(
      (await q('select shadow_walk from profiles where user_id = $1', [await userId(b.handle)])).rows[0]
        .shadow_walk,
    ).toBe(false);
  });
});

describe('the list itself', () => {
  it('needs a session, is limited per person, fails closed, and only ever shows MY incoming Tracks', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await open(b);
    await visit(a, b); // alice visited bob
    expect((await myTracks({})).status).toBe(401);
    expect((await myTracks(as(a))).data.hidden).toEqual({ today: 0, yesterday: 0, 'this-week': 0 }); // she cannot see where she went
    let status = 0;
    for (let i = 0; i < 121; i++) status = (await myTracks(as(a))).status;
    expect(status).toBe(429);
  });
});

describe('retention and integrity', () => {
  it('purge removes Tracks past a week and keeps the rest', async () => {
    const owner = await person('owner');
    const oid = await userId(owner.handle);
    for (const days of [0, 3, 6, 7, 30]) {
      const v = await insertUser('vis');
      await q(
        "insert into tracks (owner_id, visitor_id, seen_on) values ($1, $2, (now() at time zone 'utc')::date - $3::int)",
        [oid, v.id, days],
      );
    }
    expect((await purgeOldTracks()).tracks).toBe(2);
    expect(await count()).toBe(3);
  });

  it('the database refuses a Track about yourself or a second row for the same pair', async () => {
    const owner = await person('owner');
    const v = await person('visitor');
    const o = await userId(owner.handle);
    const w = await userId(v.handle);
    await expect(
      q('insert into tracks (owner_id, visitor_id, seen_on) values ($1, $1, current_date)', [o]),
    ).rejects.toThrow(/tracks_not_self/);
    await q('insert into tracks (owner_id, visitor_id, seen_on) values ($1, $2, current_date)', [o, w]);
    await expect(
      q('insert into tracks (owner_id, visitor_id, seen_on) values ($1, $2, current_date)', [o, w]),
    ).rejects.toThrow(/tracks_owner_id_visitor_id_pk/);
  });

  it('deleting either person deletes their Tracks', async () => {
    const owner = await person('owner');
    const v = await person('visitor');
    const w = await person('other');
    await open(owner);
    await visit(v, owner);
    await visit(w, owner);
    await q('delete from users where handle = $1', [v.handle]);
    expect(await count()).toBe(1);
    await q('delete from users where handle = $1', [owner.handle]);
    expect(await count()).toBe(0);
  });
});
