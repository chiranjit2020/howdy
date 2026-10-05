import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTO_HOLD_REPORTERS } from '@/modules/moderation/anti-spam';
import { handOverTownHalls, purgeExpiredRequests } from '@/modules/town-halls';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { chimesOf } from '../helpers/chimes';
import { approvePost, feed, held, post, removePost } from '../helpers/hall-feed';
import { q, report } from '../helpers/social';
import {
  act,
  create,
  getOne,
  invite,
  memberAction,
  members,
  mine,
  removeMember,
  requests,
  update,
} from '../helpers/town-halls';

/** ADR-041: Deputies, "ask to join" with a quiet no, and handing a Town Hall over. */

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
async function staffed() {
  const owner = await person('owner');
  const dep = await person('dep');
  const ann = await person('ann');
  const id = await hall(owner, [dep, ann]);
  expect((await memberAction(id, dep.handle, 'make_deputy', as(owner))).status).toBe(200);
  return { owner, dep, ann, id };
}

const roleOf = async (id: string, viewer: P, handle: string) =>
  (await members(id, as(viewer))).data.members!.find((m) => m.handle === handle)?.role;

describe('Deputies', () => {
  it('only the owner appoints one; it shows on the roster, the hall and in Chimes', async () => {
    const owner = await person('owner');
    const dep = await person('dep');
    const ann = await person('ann');
    const id = await hall(owner, [dep, ann]);
    // A member, or a would-be Deputy, cannot appoint anyone: the same 404 as a Town Hall they cannot manage.
    expect((await memberAction(id, ann.handle, 'make_deputy', as(dep))).status).toBe(404);
    expect((await memberAction(id, dep.handle, 'make_deputy', as(owner))).status).toBe(200);
    expect(await roleOf(id, ann, dep.handle)).toBe('deputy');
    expect((await getOne(id, as(dep))).data.townHall!.myRole).toBe('deputy');
    // A Deputy cannot appoint others either.
    expect((await memberAction(id, ann.handle, 'make_deputy', as(dep))).status).toBe(404);
    const chimes = (await chimesOf(as(dep))).data.chimes!;
    expect(chimes.map((c) => c.type)).toContain('townhall_made_deputy');
    // Repeat is harmless; standing down works; an invitee cannot be made a Deputy.
    expect((await memberAction(id, dep.handle, 'make_deputy', as(owner))).status).toBe(200);
    expect((await memberAction(id, dep.handle, 'make_member', as(owner))).status).toBe(200);
    expect(await roleOf(id, ann, dep.handle)).toBe('member');
    const bob = await person('bob');
    await invite(id, bob.handle, as(owner));
    expect((await memberAction(id, bob.handle, 'make_deputy', as(owner))).status).toBe(404);
  });

  it('a Deputy invites and removes ordinary members — never the owner or another Deputy', async () => {
    const { owner, dep, ann, id } = await staffed();
    const dep2 = await person('deptwo');
    await act(id, 'join', as(dep2));
    await memberAction(id, dep2.handle, 'make_deputy', as(owner));
    const bob = await person('bob');
    expect((await invite(id, bob.handle, as(dep))).status).toBe(200);
    expect((await chimesOf(as(bob))).data.chimes!.map((c) => c.type)).toContain('townhall_invited');

    expect((await removeMember(id, owner.handle, as(dep))).status).toBe(403);
    expect((await removeMember(id, dep2.handle, as(dep))).status).toBe(403);
    expect(await roleOf(id, owner, dep2.handle)).toBe('deputy');
    expect((await removeMember(id, ann.handle, as(dep))).status).toBe(200);
    expect(await roleOf(id, owner, ann.handle)).toBeUndefined();
    // Members get the 404 they always did.
    const cal = await person('cal');
    await act(id, 'join', as(cal));
    expect((await removeMember(id, dep.handle, as(cal))).status).toBe(404);
    expect((await invite(id, ann.handle, as(cal))).status).toBe(404);
    // The owner may remove a Deputy.
    expect((await removeMember(id, dep2.handle, as(owner))).status).toBe(200);
  });

  it('only the owner edits, switches the join rule, or deletes', async () => {
    const { dep, id } = await staffed();
    expect((await update(id, { name: 'Taken Over' }, as(dep))).status).toBe(404);
    expect((await update(id, { joinRule: 'approval' }, as(dep))).status).toBe(404);
  });

  it('a Deputy keeps the feed in order among ordinary members — not the owner, not another Deputy', async () => {
    const { owner, dep, ann, id } = await staffed();
    const annPost = (await post(id, { body: 'from ann' }, as(ann))).data.post!.id;
    const ownerPost = (await post(id, { body: 'from the owner' }, as(owner))).data.post!.id;
    const dep2 = await person('deptwo');
    await act(id, 'join', as(dep2));
    await memberAction(id, dep2.handle, 'make_deputy', as(owner));
    const depPost = (await post(id, { body: 'from the other deputy' }, as(dep2))).data.post!.id;

    const view = (await feed(id, as(dep))).data.posts!;
    const can = (pid: string) => view.find((p) => p.id === pid)!.canRemove;
    expect([can(annPost), can(ownerPost), can(depPost)]).toEqual([true, false, false]);
    expect((await removePost(ownerPost, as(dep))).status).toBe(404);
    expect((await removePost(depPost, as(dep))).status).toBe(404);
    expect((await removePost(annPost, as(dep))).status).toBe(200);
    // The owner still may take down a Deputy's post; an ordinary member still may not take down anyone's.
    expect((await feed(id, as(ann))).data.posts!.every((p) => p.canRemove === false)).toBe(true);
    expect((await removePost(depPost, as(owner))).status).toBe(200);
  });

  it('a Deputy clears the held tray; their own words are never held', async () => {
    const { dep, id } = await staffed();
    const writer = await person('writer');
    await act(id, 'join', as(writer));
    for (let i = 0; i < AUTO_HOLD_REPORTERS; i++)
      await report({ handle: writer.handle, reason: 'spam' }, as(await person(`r${i}`)));
    const pid = (await post(id, { body: 'held post' }, as(writer))).data.post!.id;
    const tray = await held(id, as(dep));
    expect(tray.status).toBe(200);
    expect(tray.data.posts!.map((p) => p.id)).toEqual([pid]);
    expect((await approvePost(pid, as(dep))).status).toBe(200);

    for (let i = 0; i < AUTO_HOLD_REPORTERS; i++)
      await report({ handle: dep.handle, reason: 'spam' }, as(await person(`s${i}`)));
    await post(id, { body: 'deputy speaking' }, as(dep));
    expect((await held(id, as(dep))).data.posts).toEqual([]);
  });

  it('a Deputy who is stood down loses every power at once', async () => {
    const { owner, dep, ann, id } = await staffed();
    await memberAction(id, dep.handle, 'make_member', as(owner));
    expect((await held(id, as(dep))).status).toBe(404);
    expect((await removeMember(id, ann.handle, as(dep))).status).toBe(404);
    expect((await invite(id, (await person('bob')).handle, as(dep))).status).toBe(404);
  });
});

describe('ask to join', () => {
  it('a Town Hall that needs approval: asking leaves a request every staff member hears about', async () => {
    const { owner, dep, id } = await staffed();
    await update(id, { joinRule: 'approval' }, as(owner));
    const eve = await person('eve');
    const before = (await getOne(id, as(eve))).data.townHall!;
    expect(before).toMatchObject({ joinRule: 'approval', canJoin: false, canAsk: true, membership: 'none' });
    const asked = await act(id, 'join', as(eve));
    expect(asked.data.townHall).toMatchObject({ membership: 'requested', canAsk: false, canJoin: false });
    // Not a member yet: no feed, no roster.
    expect((await feed(id, as(eve))).status).toBe(404);
    expect((await members(id, as(eve))).status).toBe(404);
    // Both the owner and the Deputy see it and get a Chime; ordinary members see nothing.
    expect((await requests(id, as(owner))).data.requests!.map((r) => r.handle)).toEqual([eve.handle]);
    expect((await requests(id, as(dep))).data.requests!.map((r) => r.handle)).toEqual([eve.handle]);
    for (const s of [owner, dep]) {
      expect((await chimesOf(as(s))).data.chimes!.map((c) => c.type)).toContain('townhall_join_requested');
    }
    const ann = await person('annie');
    await update(id, { joinRule: 'instant' }, as(owner));
    await act(id, 'join', as(ann));
    await update(id, { joinRule: 'approval' }, as(owner));
    expect((await requests(id, as(ann))).status).toBe(404);
    // "My Town Halls" tells staff how many are waiting, and nobody else.
    const ownerMine = (await mine(as(owner))).data.townHalls!.find((t) => t.id === id)!;
    expect(ownerMine.requestsWaiting).toBe(1);
    expect((await mine(as(ann))).data.townHalls!.find((t) => t.id === id)!.requestsWaiting).toBeNull();
  });

  it('let in: a member at once, with a Chime', async () => {
    const owner = await person('owner');
    const id = await hall(owner, [], { joinRule: 'approval' });
    const eve = await person('eve');
    await act(id, 'join', as(eve));
    expect((await memberAction(id, eve.handle, 'approve', as(owner))).status).toBe(200);
    expect((await getOne(id, as(eve))).data.townHall!.membership).toBe('active');
    expect((await feed(id, as(eve))).status).toBe(200);
    expect((await chimesOf(as(eve))).data.chimes!.map((c) => c.type)).toContain('townhall_request_approved');
  });

  it('a "no" is never announced: the asker sees exactly what an unanswered request shows', async () => {
    const owner = await person('owner');
    const id = await hall(owner, [], { joinRule: 'approval' });
    const eve = await person('eve');
    const fred = await person('fred');
    await act(id, 'join', as(eve));
    await act(id, 'join', as(fred));
    expect((await memberAction(id, eve.handle, 'decline', as(owner))).status).toBe(200);
    await flushBackground();

    const shape = async (p: P) => {
      const t = (await getOne(id, as(p))).data.townHall!;
      return { membership: t.membership, canAsk: t.canAsk, canJoin: t.canJoin };
    };
    expect(await shape(eve)).toEqual(await shape(fred));
    expect(await shape(eve)).toEqual({ membership: 'requested', canAsk: false, canJoin: false });
    expect((await chimesOf(as(eve))).data.chimes).toEqual([]);
    // Asking again changes nothing (no new Chime to the staff, no new place in the queue).
    expect((await act(id, 'join', as(eve))).data.townHall!.membership).toBe('requested');
    expect((await requests(id, as(owner))).data.requests!.map((r) => r.handle)).toEqual([fred.handle]);
    // And it cannot be taken back to ask afresh.
    expect((await act(id, 'leave', as(eve))).status).toBe(400);
  });

  it('a request runs out after 30 days: then it is gone, and the person may ask again', async () => {
    const owner = await person('owner');
    const id = await hall(owner, [], { joinRule: 'approval' });
    const eve = await person('eve');
    await act(id, 'join', as(eve));
    await memberAction(id, eve.handle, 'decline', as(owner));
    await q(
      `update town_hall_members set created_at = now() - interval '31 days' where status = 'requested'`,
    );
    expect((await getOne(id, as(eve))).data.townHall).toMatchObject({ membership: 'none', canAsk: true });
    // Staff cannot answer a request that ran out.
    expect((await memberAction(id, eve.handle, 'approve', as(owner))).status).toBe(404);
    expect((await act(id, 'join', as(eve))).data.townHall!.membership).toBe('requested');
    expect((await requests(id, as(owner))).data.requests!.map((r) => r.handle)).toEqual([eve.handle]);

    await q(
      `update town_hall_members set created_at = now() - interval '31 days' where status = 'requested'`,
    );
    expect((await purgeExpiredRequests()).requests).toBe(1);
    expect(
      (await q(`select count(*)::int n from town_hall_members where status = 'requested'`)).rows[0].n,
    ).toBe(0);
  });

  it('switching back to "anyone can join" lets a waiting asker in with one tap; an invite lets them in too', async () => {
    const owner = await person('owner');
    const id = await hall(owner, [], { joinRule: 'approval' });
    const eve = await person('eve');
    const fred = await person('fred');
    await act(id, 'join', as(eve));
    await act(id, 'join', as(fred));
    await update(id, { joinRule: 'instant' }, as(owner));
    expect((await getOne(id, as(eve))).data.townHall!.canJoin).toBe(true);
    expect((await act(id, 'join', as(eve))).data.townHall!.membership).toBe('active');
    // Inviting someone who asked is the same as letting them in.
    await update(id, { joinRule: 'approval' }, as(owner));
    expect((await invite(id, fred.handle, as(owner))).status).toBe(200);
    expect((await getOne(id, as(fred))).data.townHall!.membership).toBe('active');
  });

  it('invite-only Town Halls are unaffected: nobody can ask, and a made-up id is still a 404', async () => {
    const owner = await person('owner');
    const id = await hall(owner, [], { visibility: 'invite', joinRule: 'approval' });
    const eve = await person('eve');
    expect((await act(id, 'join', as(eve))).status).toBe(404);
    expect((await getOne(id, as(eve))).status).toBe(404);
    expect((await requests('00000000-0000-4000-8000-000000000000', as(owner))).status).toBe(404);
  });

  it('asking is limited per person (each ask rings every staff member)', async () => {
    const eve = await person('eve');
    const owner = await person('owner');
    // Straight into the database: creating Town Halls has its own (smaller) daily budget.
    const { rows } = await q(
      `with made as (
         insert into town_halls (owner_id, name, description, visibility, join_rule)
         select u.id, 'Hall ' || g, 'x', 'open', 'approval' from users u, generate_series(1, 11) g
          where u.handle = $1
         returning id, owner_id)
       insert into town_hall_members (town_hall_id, user_id, role, status)
       select id, owner_id, 'owner', 'active' from made returning town_hall_id`,
      [owner.handle],
    );
    const ids = rows.map((r) => r.town_hall_id as string);
    for (const id of ids.slice(0, 10)) expect((await act(id, 'join', as(eve))).status).toBe(200);
    expect((await act(ids[10]!, 'join', as(eve))).status).toBe(429);
  });
});

describe('handing a Town Hall over', () => {
  it('only to a Deputy, only by the owner; the old owner becomes a Deputy', async () => {
    const { owner, dep, ann, id } = await staffed();
    expect((await memberAction(id, ann.handle, 'make_owner', as(owner))).status).toBe(400);
    expect((await memberAction(id, owner.handle, 'make_owner', as(dep))).status).toBe(404);
    expect((await memberAction(id, dep.handle, 'make_owner', as(owner))).status).toBe(200);
    expect((await getOne(id, as(dep))).data.townHall).toMatchObject({ isOwner: true, myRole: 'owner' });
    expect((await getOne(id, as(owner))).data.townHall).toMatchObject({ isOwner: false, myRole: 'deputy' });
    expect((await chimesOf(as(dep))).data.chimes!.map((c) => c.type)).toContain('townhall_made_owner');
    // Exactly one owner, and the Town Hall row agrees.
    const { rows } = await q(
      `select (select count(*)::int from town_hall_members where town_hall_id = $1 and role = 'owner') as owners,
              (select owner_id from town_halls where id = $1) as owner_id,
              (select id from users where handle = $2) as dep_id`,
      [id, dep.handle],
    );
    expect(rows[0].owners).toBe(1);
    expect(rows[0].owner_id).toBe(rows[0].dep_id);
    // The old owner can now leave; the new one cannot (they must hand it on or delete it).
    expect((await act(id, 'leave', as(dep))).status).toBe(400);
    expect((await act(id, 'leave', as(owner))).status).toBe(200);
    // The new owner's powers are real.
    expect((await update(id, { name: 'New Management' }, as(dep))).status).toBe(200);
  });

  it('when an owner account is deleted, the longest-serving Deputy takes over; with none, it goes', async () => {
    const owner = await person('owner');
    const first = await person('first');
    const second = await person('second');
    const id = await hall(owner, [first, second]);
    // `second` made Deputy before `first`, but `first` has been a member longer.
    await memberAction(id, second.handle, 'make_deputy', as(owner));
    await memberAction(id, first.handle, 'make_deputy', as(owner));
    const lonely = await hall(owner);
    const ownerId = (await q('select id from users where handle = $1', [owner.handle])).rows[0].id as string;

    expect(await handOverTownHalls(ownerId)).toEqual({ handedOver: 1 });
    expect((await getOne(id, as(first))).data.townHall!.isOwner).toBe(true);
    await q('delete from users where id = $1', [ownerId]);
    expect((await getOne(id, as(first))).status).toBe(200);
    expect((await q('select count(*)::int n from town_halls where id = $1', [lonely])).rows[0].n).toBe(0);
  });
});
