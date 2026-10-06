import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { purgeExpiredRequests } from '@/modules/town-halls';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { chimesOf } from '../helpers/chimes';
import { feed } from '../helpers/hall-feed';
import { q } from '../helpers/social';
import {
  act,
  ban,
  bans,
  create,
  directory,
  getOne,
  invite,
  liftBan,
  memberAction,
  members,
  requests,
  update,
} from '../helpers/town-halls';

/** ADR-042: banning someone from a Town Hall — silently, by the owner or a Deputy, until lifted. */

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

async function hall(owner: P, joiners: P[] = [], extra: Record<string, unknown> = {}): Promise<string> {
  const r = await create(
    { name: 'Porch Talk', description: 'Chatting on the porch.', visibility: 'open', ...extra },
    as(owner),
  );
  expect(r.status).toBe(201);
  const id = r.data.townHall!.id;
  for (const j of joiners) expect((await act(id, 'join', as(j))).status).toBe(200);
  return id;
}

/** A Town Hall with an owner, a Deputy and an ordinary member. */
async function staffed(extra: Record<string, unknown> = {}) {
  const owner = await person('owner');
  const dep = await person('dep');
  const ann = await person('ann');
  const id = await hall(owner, [dep, ann], extra);
  expect((await memberAction(id, dep.handle, 'make_deputy', as(owner))).status).toBe(200);
  return { owner, dep, ann, id };
}

/** What a would-be joiner can tell about their standing. */
const shape = async (id: string, p: P) => {
  const t = (await getOne(id, as(p))).data.townHall!;
  return { joinRule: t.joinRule, membership: t.membership, canAsk: t.canAsk, canJoin: t.canJoin };
};

const banned = (id: string, viewer: P) => bans(id, as(viewer)).then((r) => r.data.bans!.map((b) => b.handle));

describe('banning', () => {
  it('removes a member, who can never get back into an "anyone can join" Town Hall', async () => {
    const { owner, ann, id } = await staffed();
    expect((await ban(id, ann.handle, as(owner))).status).toBe(200);
    expect((await members(id, as(ann))).status).toBe(404);
    expect((await feed(id, as(ann))).status).toBe(404);
    // Joining now only ever "asks" — and is never answered.
    const tried = await act(id, 'join', as(ann));
    expect(tried.status).toBe(200);
    expect(tried.data.townHall).toMatchObject({ membership: 'requested', canJoin: false, canAsk: false });
    expect((await members(id, as(ann))).status).toBe(404);
    const list = (await bans(id, as(owner))).data.bans!;
    expect(list.map((b) => [b.handle, b.bannedBy])).toEqual([[ann.handle, owner.handle]]);
  });

  it('is silent: the banned person sees exactly what a quietly declined asker sees', async () => {
    const owner = await person('owner');
    const open = await hall(owner);
    const gated = await hall(owner, [], { joinRule: 'approval' });
    const eve = await person('eve');
    const fred = await person('fred');
    expect((await ban(open, eve.handle, as(owner))).status).toBe(200);
    expect((await ban(gated, eve.handle, as(owner))).status).toBe(200);

    // Before asking: both Town Halls look like ones that need approval, to her alone.
    const fresh = { joinRule: 'approval', membership: 'none', canAsk: true, canJoin: false };
    expect(await shape(open, eve)).toEqual(fresh);
    expect(await shape(gated, eve)).toEqual(fresh);
    expect(await shape(open, fred)).toMatchObject({ joinRule: 'instant', canJoin: true });
    const listed = (await directory(as(eve))).data.townHalls!.find((t) => t.id === open)!;
    expect(listed.joinRule).toBe('approval');
    expect((await directory(as(fred))).data.townHalls!.find((t) => t.id === open)!.joinRule).toBe('instant');

    // Fred asks and is declined; Eve "asks" while banned. Nobody on the staff hears about Eve.
    await act(gated, 'join', as(fred));
    await memberAction(gated, fred.handle, 'decline', as(owner));
    await act(gated, 'join', as(eve));
    await act(open, 'join', as(eve));
    await flushBackground();
    expect(await shape(gated, eve)).toEqual(await shape(gated, fred));
    expect(await shape(open, eve)).toEqual(await shape(gated, fred));
    expect((await requests(gated, as(owner))).data.requests).toEqual([]);
    expect((await requests(open, as(owner))).data.requests).toEqual([]);
    const ownerChimes = (await chimesOf(as(owner))).data.chimes!.map((c) => c.type);
    expect(ownerChimes.filter((t) => t === 'townhall_join_requested')).toHaveLength(1); // Fred's only
    expect((await chimesOf(as(eve))).data.chimes).toEqual([]);
    // And, like a real request, it cannot be taken back.
    expect((await act(open, 'leave', as(eve))).status).toBe(400);
    expect((await act(gated, 'leave', as(fred))).status).toBe(400);
  });

  it('a banned "request" runs out after 30 days like a real one, and the purge forgets when they asked', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    const eve = await person('eve');
    await ban(id, eve.handle, as(owner));
    await act(id, 'join', as(eve));
    await q(`update town_hall_bans set asked_at = now() - interval '31 days'`);
    expect(await shape(id, eve)).toMatchObject({ membership: 'none', canAsk: true });
    expect((await act(id, 'join', as(eve))).data.townHall!.membership).toBe('requested');
    await q(`update town_hall_bans set asked_at = now() - interval '31 days'`);
    await purgeExpiredRequests();
    const { rows } = await q(`select asked_at from town_hall_bans`);
    expect(rows).toEqual([{ asked_at: null }]);
    // The ban itself stays.
    expect(await banned(id, owner)).toEqual([eve.handle]);
  });

  it('a Deputy bans ordinary members and strangers — never the owner or another Deputy', async () => {
    const { owner, dep, ann, id } = await staffed();
    const dep2 = await person('dep2');
    await act(id, 'join', as(dep2));
    await memberAction(id, dep2.handle, 'make_deputy', as(owner));
    const stranger = await person('stranger');

    expect((await ban(id, ann.handle, as(dep))).status).toBe(200);
    expect((await ban(id, stranger.handle, as(dep))).status).toBe(200);
    expect((await ban(id, owner.handle, as(dep))).status).toBe(403);
    expect((await ban(id, dep2.handle, as(dep))).status).toBe(403);
    // The owner must stand a Deputy down first.
    expect((await ban(id, dep2.handle, as(owner))).status).toBe(400);
    expect((await members(id, as(dep2))).status).toBe(200);
    await memberAction(id, dep2.handle, 'make_member', as(owner));
    expect((await ban(id, dep2.handle, as(owner))).status).toBe(200);
    expect((await members(id, as(dep2))).status).toBe(404);
    // Nobody bans themself.
    expect((await ban(id, dep.handle, as(dep))).status).toBe(400);
    expect((await ban(id, 'nobody_has_this', as(dep))).status).toBe(404);
    expect(new Set(await banned(id, dep))).toEqual(new Set([ann.handle, stranger.handle, dep2.handle]));
  });

  it('ordinary members and outsiders cannot see, set or lift bans: the same 404 as a Town Hall they do not run', async () => {
    const { owner, ann, id } = await staffed();
    const eve = await person('eve');
    await ban(id, eve.handle, as(owner));
    const fred = await person('fred');
    for (const p of [ann, fred]) {
      expect((await bans(id, as(p))).status).toBe(404);
      expect((await ban(id, owner.handle, as(p))).status).toBe(404);
      expect((await liftBan(id, eve.handle, as(p))).status).toBe(404);
    }
    expect((await bans('00000000-0000-4000-8000-000000000000', as(owner))).status).toBe(404);
    expect(await banned(id, owner)).toEqual([eve.handle]);
  });

  it('wipes out a pending invite or request, and a banned person cannot be invited', async () => {
    const owner = await person('owner');
    const gated = await hall(owner, [], { joinRule: 'approval' });
    const eve = await person('eve');
    const fred = await person('fred');
    await act(gated, 'join', as(eve));
    await invite(gated, fred.handle, as(owner));
    await ban(gated, eve.handle, as(owner));
    await ban(gated, fred.handle, as(owner));
    expect((await requests(gated, as(owner))).data.requests).toEqual([]);
    expect((await act(gated, 'accept', as(fred))).status).toBe(404);
    const again = await invite(gated, fred.handle, as(owner));
    expect(again.status).toBe(409);
    expect(again.data.error!.message).toContain('Lift the ban');
    expect(
      (await q(`select count(*)::int n from town_hall_members where town_hall_id = $1`, [gated])).rows[0].n,
    ).toBe(1); // the owner alone
  });

  it('an invite-only Town Hall disappears for a banned member', async () => {
    const owner = await person('owner');
    const id = await hall(owner, [], { visibility: 'invite' });
    const eve = await person('eve');
    await invite(id, eve.handle, as(owner));
    await act(id, 'accept', as(eve));
    expect((await getOne(id, as(eve))).status).toBe(200);
    await ban(id, eve.handle, as(owner));
    expect((await getOne(id, as(eve))).status).toBe(404);
    expect((await act(id, 'join', as(eve))).status).toBe(404);
  });

  it('repeating a ban changes nothing (who set it and when are kept)', async () => {
    const { owner, dep, ann, id } = await staffed();
    await ban(id, ann.handle, as(dep));
    expect((await ban(id, ann.handle, as(owner))).status).toBe(200);
    expect((await bans(id, as(owner))).data.bans!.map((b) => b.bannedBy)).toEqual([dep.handle]);
  });

  it('no join racing a ban can leave a banned person inside', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    const eve = await person('eve');
    const eveId = (await q('select id from users where handle = $1', [eve.handle])).rows[0].id as string;
    // White-box, because the window is too small to hit over HTTP: a ban that is half done (holding the per-person
    // lock, as `banPerson` does) when the join arrives. The join must wait for it and then see the ban.
    const banner = await getPool().connect();
    try {
      await banner.query('begin');
      await banner.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `townhall:${id}:${eveId}`,
      ]);
      const joining = act(id, 'join', as(eve));
      await new Promise((r) => setTimeout(r, 300));
      await banner.query(`insert into town_hall_bans (town_hall_id, user_id) values ($1, $2)`, [id, eveId]);
      await banner.query(`delete from town_hall_members where town_hall_id = $1 and user_id = $2`, [
        id,
        eveId,
      ]);
      await banner.query('commit');
      expect((await joining).data.townHall!.membership).toBe('requested');
    } finally {
      banner.release();
    }
    expect((await members(id, as(eve))).status).toBe(404);
    // And over HTTP, many at once: never both banned and inside.
    const racers = await Promise.all([1, 2, 3, 4].map((n) => person(`racer${n}`)));
    await Promise.all(racers.flatMap((r) => [act(id, 'join', as(r)), ban(id, r.handle, as(owner))]));
    const { rows } = await q(
      `select count(*)::int n from town_hall_members m
         join town_hall_bans b on b.town_hall_id = m.town_hall_id and b.user_id = m.user_id`,
    );
    expect(rows[0].n).toBe(0);
  });
});

describe('lifting a ban', () => {
  it('lets them join again like anyone — it does not put them back by itself', async () => {
    const { owner, dep, ann, id } = await staffed();
    await ban(id, ann.handle, as(owner));
    await act(id, 'join', as(ann));
    // A Deputy may lift a ban (staff share the list); doing it twice is harmless.
    expect((await liftBan(id, ann.handle, as(dep))).status).toBe(200);
    expect((await liftBan(id, ann.handle, as(dep))).status).toBe(200);
    expect(await banned(id, owner)).toEqual([]);
    expect(await shape(id, ann)).toEqual({
      joinRule: 'instant',
      membership: 'none',
      canAsk: false,
      canJoin: true,
    });
    expect((await members(id, as(ann))).status).toBe(404);
    expect((await act(id, 'join', as(ann))).data.townHall!.membership).toBe('active');
    expect((await invite(id, ann.handle, as(owner))).status).toBe(200);
  });

  it('switching the Town Hall to "ask to join" and back does not lift anyone', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    const eve = await person('eve');
    await ban(id, eve.handle, as(owner));
    await update(id, { joinRule: 'approval' }, as(owner));
    await update(id, { joinRule: 'instant' }, as(owner));
    expect((await act(id, 'join', as(eve))).data.townHall!.membership).toBe('requested');
    expect((await members(id, as(eve))).status).toBe(404);
  });
});

describe('when accounts go', () => {
  it("the banned person's account takes the ban with it; the banner's leaves it in place, unsigned", async () => {
    const { owner, dep, ann, id } = await staffed();
    const eve = await person('eve');
    await ban(id, ann.handle, as(dep));
    await ban(id, eve.handle, as(owner));
    await q(`delete from users where handle = $1`, [eve.handle]);
    await q(`delete from users where handle = $1`, [dep.handle]);
    expect((await bans(id, as(owner))).data.bans!.map((b) => [b.handle, b.bannedBy])).toEqual([
      [ann.handle, null],
    ]);
  });
});
