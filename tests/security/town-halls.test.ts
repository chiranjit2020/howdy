import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { doAct, insertUser, q, userId } from '../helpers/social';
import {
  act,
  create,
  directory,
  getOne,
  invite,
  members,
  mine,
  myInvites,
  remove,
  removeMember,
  update,
} from '../helpers/town-halls';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const count = async () => (await q('select count(*)::int n from town_halls')).rows[0].n as number;
const memberCount = async () =>
  (await q('select count(*)::int n from town_hall_members')).rows[0].n as number;

const make = (body: Partial<{ name: string; description: string; visibility: string }> = {}) => ({
  name: 'Chess Club',
  description: 'Weekly matches, all levels welcome.',
  visibility: 'open',
  ...body,
});

describe('creating one', () => {
  it('the creator becomes its owner and active member at once', async () => {
    const owner = await person('owner');
    const res = await create(make(), as(owner));
    expect(res.status).toBe(201);
    expect(res.data.townHall).toMatchObject({ name: 'Chess Club', isOwner: true, membership: 'active' });
    const row = (await q('select role, status from town_hall_members')).rows[0];
    expect(row).toEqual({ role: 'owner', status: 'active' });
  });

  it('needs a session, and rejects a bad name, description or visibility', async () => {
    expect((await create(make(), {})).status).toBe(401);
    const owner = await person('owner');
    for (const bad of [
      make({ name: '' }),
      make({ name: 'ab' }), // below the 3-char minimum
      make({ name: 'x'.repeat(51) }),
      make({ description: '' }),
      make({ description: 'x'.repeat(281) }),
      make({ description: 'Visit https://example.com now' }),
      make({ visibility: 'everyone' }),
    ]) {
      expect((await create(bad, as(owner))).status, JSON.stringify(bad)).toBe(422);
    }
    expect(await count()).toBe(0);
  });

  it('is rate limited per person', async () => {
    const owner = await person('owner');
    let status = 0;
    for (let i = 0; i < 6; i++) status = (await create(make({ name: `Club ${i}` }), as(owner))).status;
    expect(status).toBe(429);
  });
});

describe('the directory', () => {
  it('lists only open and members visibility, never invite-only', async () => {
    const owner = await person('owner');
    await create(make({ name: 'Open One', visibility: 'open' }), as(owner));
    await create(make({ name: 'Members One', visibility: 'members' }), as(owner));
    await create(make({ name: 'Secret One', visibility: 'invite' }), as(owner));
    const stranger = await person('stranger');
    const seen = await directory(as(stranger));
    const names = seen.data.townHalls!.map((t) => t.name);
    expect(names).toContain('Open One');
    expect(names).toContain('Members One');
    expect(names).not.toContain('Secret One');
  });

  it('marks a Town Hall as joined once you have joined it', async () => {
    const owner = await person('owner');
    const made = await create(make(), as(owner));
    const id = made.data.townHall!.id;
    const stranger = await person('stranger');
    expect((await directory(as(stranger))).data.townHalls![0]!.joined).toBe(false);
    await act(id, 'join', as(stranger));
    expect((await directory(as(stranger))).data.townHalls![0]!.joined).toBe(true);
  });

  it('never reveals a member count', async () => {
    const owner = await person('owner');
    await create(make(), as(owner));
    const stranger = await person('stranger');
    const seen = await directory(as(stranger));
    expect(seen.text).not.toMatch(/memberCount|"count"/i);
  });

  it('needs a session', async () => {
    expect((await directory({})).status).toBe(401);
  });
});

describe('reading one', () => {
  it('invite-only is hidden from everyone without a membership row (the same 404 as missing)', async () => {
    const owner = await person('owner');
    const made = await create(make({ visibility: 'invite' }), as(owner));
    const id = made.data.townHall!.id;
    const stranger = await person('stranger');
    expect((await getOne(id, as(stranger))).status).toBe(404);
    expect((await getOne('00000000-0000-0000-0000-000000000000', as(stranger))).status).toBe(404);
    expect((await getOne(id, as(owner))).status).toBe(200);
  });

  it('open/members are visible to any active viewer, with the right membership state', async () => {
    const owner = await person('owner');
    const made = await create(make(), as(owner));
    const id = made.data.townHall!.id;
    const stranger = await person('stranger');
    expect((await getOne(id, as(stranger))).data.townHall).toMatchObject({
      membership: 'none',
      canJoin: true,
    });
  });
});

describe('joining and leaving', () => {
  it('joining open/members works with one tap and is idempotent', async () => {
    const owner = await person('owner');
    const made = await create(make(), as(owner));
    const id = made.data.townHall!.id;
    const joiner = await person('joiner');
    expect((await act(id, 'join', as(joiner))).status).toBe(200);
    expect((await act(id, 'join', as(joiner))).status).toBe(200); // idempotent
    expect(await memberCount()).toBe(2); // owner + joiner, not 3
  });

  it('cannot self-join an invite-only Town Hall', async () => {
    const owner = await person('owner');
    const made = await create(make({ visibility: 'invite' }), as(owner));
    const stranger = await person('stranger');
    expect((await act(made.data.townHall!.id, 'join', as(stranger))).status).toBe(404);
  });

  it('a member can leave; the owner cannot (must delete instead); leaving twice is harmless', async () => {
    const owner = await person('owner');
    const made = await create(make(), as(owner));
    const id = made.data.townHall!.id;
    const joiner = await person('joiner');
    await act(id, 'join', as(joiner));
    expect((await act(id, 'leave', as(owner))).status).toBe(400);
    expect((await act(id, 'leave', as(joiner))).status).toBe(200);
    expect((await act(id, 'leave', as(joiner))).status).toBe(200);
    expect(await memberCount()).toBe(1); // just the owner
  });

  it('acting is rate limited per person (the limit is spent even on an idempotent repeat)', async () => {
    const owner = await person('owner');
    const made = await create(make(), as(owner));
    const id = made.data.townHall!.id;
    const joiner = await person('joiner');
    let status = 0;
    for (let i = 0; i < 61; i++) status = (await act(id, 'join', as(joiner))).status;
    expect(status).toBe(429);
  });
});

describe('invites', () => {
  it('only the owner can invite; a repeat invite is a harmless no-op; cannot invite yourself', async () => {
    const owner = await person('owner');
    const made = await create(make({ visibility: 'invite' }), as(owner));
    const id = made.data.townHall!.id;
    const target = await person('target');
    const notOwner = await person('notowner');

    expect((await invite(id, target.handle, as(notOwner))).status).toBe(404);
    expect((await invite(id, target.handle, as(owner))).status).toBe(200);
    expect((await invite(id, target.handle, as(owner))).status).toBe(200); // idempotent no-op
    expect((await invite(id, owner.handle, as(owner))).status).toBe(400); // self

    const row = (
      await q('select status from town_hall_members where user_id = $1', [await userId(target.handle)])
    ).rows[0];
    expect(row.status).toBe('invited');
    expect(await memberCount()).toBe(2); // owner + one invited row, no duplicates
  });

  it('is rate limited per Town Hall (stricter than the per-person budget, so one hall cannot eat the whole thing)', async () => {
    const owner = await person('owner');
    const made = await create(make({ visibility: 'invite' }), as(owner));
    const id = made.data.townHall!.id;
    let status = 0;
    for (let i = 0; i < 21; i++) {
      const t = await insertUser('target');
      status = (await invite(id, t.handle, as(owner))).status;
    }
    expect(status).toBe(429);
  });

  it('is also rate limited per inviter, across several Town Halls (below any one hall’s own limit)', async () => {
    const owner = await person('owner');
    const ownerId = await userId(owner.handle);
    let status = 0;
    for (let i = 0; i < 31; i++) {
      // Bulk-inserted directly: going through the create endpoint would hit ITS OWN (5/day) limit first.
      const [hall] = (
        await q(
          "insert into town_halls (owner_id, name, description, visibility) values ($1, $2, 'x', 'invite') returning id",
          [ownerId, `Hall ${i}`],
        )
      ).rows;
      await q(
        "insert into town_hall_members (town_hall_id, user_id, role, status) values ($1, $2, 'owner', 'active')",
        [hall.id, ownerId],
      );
      const t = await insertUser('target');
      status = (await invite(hall.id, t.handle, as(owner))).status;
    }
    expect(status).toBe(429);
  });

  it('an invited person sees it in "my invites"; accepting makes them active and tells the owner; declining removes it', async () => {
    const owner = await person('owner');
    const made = await create(make({ visibility: 'invite' }), as(owner));
    const id = made.data.townHall!.id;
    const invitee = await person('invitee');
    await invite(id, invitee.handle, as(owner));

    const seen = await myInvites(as(invitee));
    expect(seen.data.invites!.map((i) => i.townHallId)).toEqual([id]);
    expect(seen.data.invites![0]!.invitedBy.handle).toBe(owner.handle);

    expect((await act(id, 'accept', as(invitee))).status).toBe(200);
    expect((await getOne(id, as(invitee))).data.townHall!.membership).toBe('active');
    expect((await myInvites(as(invitee))).data.invites).toEqual([]);

    const decliner = await person('decliner');
    await invite(id, decliner.handle, as(owner));
    expect((await act(id, 'decline', as(decliner))).status).toBe(200);
    expect((await getOne(id, as(decliner))).status).toBe(404); // back to invisible
  });

  it('accepting or declining with no pending invite is a 404', async () => {
    const owner = await person('owner');
    const made = await create(make(), as(owner));
    const stranger = await person('stranger');
    expect((await act(made.data.townHall!.id, 'accept', as(stranger))).status).toBe(404);
    expect((await act(made.data.townHall!.id, 'decline', as(stranger))).status).toBe(404);
  });
});

describe('the roster', () => {
  it('only active members may read it; a non-member gets the same 404 as a missing Town Hall', async () => {
    const owner = await person('owner');
    const made = await create(make(), as(owner));
    const id = made.data.townHall!.id;
    const joiner = await person('joiner');
    await act(id, 'join', as(joiner));
    const stranger = await person('stranger');

    expect((await members(id, as(stranger))).status).toBe(404);
    const seen = await members(id, as(joiner));
    expect(seen.status).toBe(200);
    expect(seen.data.members!.map((m) => m.handle).sort()).toEqual([joiner.handle, owner.handle].sort());
    expect(seen.data.members!.find((m) => m.handle === owner.handle)!.role).toBe('owner');
  });
});

describe('managing members', () => {
  it('the owner can remove a member (or revoke an invite); nobody else can; cannot remove self this way', async () => {
    const owner = await person('owner');
    const made = await create(make({ visibility: 'invite' }), as(owner));
    const id = made.data.townHall!.id;
    const joiner = await person('joiner');
    await invite(id, joiner.handle, as(owner));
    await act(id, 'accept', as(joiner));

    const notOwner = await person('notowner');
    expect((await removeMember(id, joiner.handle, as(notOwner))).status).toBe(404);
    expect((await removeMember(id, owner.handle, as(owner))).status).toBe(400); // self
    expect((await removeMember(id, joiner.handle, as(owner))).status).toBe(200);
    expect(await memberCount()).toBe(1); // just the owner
  });
});

describe('updating and deleting', () => {
  it('only the owner can change name/description/visibility', async () => {
    const owner = await person('owner');
    const made = await create(make(), as(owner));
    const id = made.data.townHall!.id;
    const notOwner = await person('notowner');
    expect((await update(id, { name: 'New Name' }, as(notOwner))).status).toBe(404);
    const res = await update(id, { name: 'New Name' }, as(owner));
    expect(res.status).toBe(200);
    expect(res.data.townHall!.name).toBe('New Name');
  });

  it('only the owner can delete it, and deleting removes every membership (cascade)', async () => {
    const owner = await person('owner');
    const made = await create(make(), as(owner));
    const id = made.data.townHall!.id;
    const joiner = await person('joiner');
    await act(id, 'join', as(joiner));
    const notOwner = await person('notowner');
    expect((await remove(id, as(notOwner))).status).toBe(404);
    expect((await remove(id, as(owner))).status).toBe(200);
    expect(await count()).toBe(0);
    expect(await memberCount()).toBe(0);
  });
});

describe('"mine"', () => {
  it('lists every Town Hall I belong to, whatever its visibility, and nothing I do not belong to', async () => {
    const owner = await person('owner');
    const open = await create(make({ name: 'Open', visibility: 'open' }), as(owner));
    const secret = await create(make({ name: 'Secret', visibility: 'invite' }), as(owner));
    await create(make({ name: 'NotMine' }), as(owner));

    const joiner = await person('joiner');
    await act(open.data.townHall!.id, 'join', as(joiner));
    await invite(secret.data.townHall!.id, joiner.handle, as(owner));
    await act(secret.data.townHall!.id, 'accept', as(joiner));

    const seen = await mine(as(joiner));
    expect(seen.data.townHalls!.map((t) => t.name).sort()).toEqual(['Open', 'Secret']);
  });
});

describe('Chimes', () => {
  it('an invite rings the invitee; accepting rings the owner back; a muted inviter rings nobody', async () => {
    const owner = await person('owner');
    const made = await create(make({ visibility: 'invite' }), as(owner));
    const id = made.data.townHall!.id;
    const invitee = await person('invitee');
    await invite(id, invitee.handle, as(owner));
    await flushBackground();

    const chime1 = (
      await q('select type from notifications where recipient_id = $1', [await userId(invitee.handle)])
    ).rows;
    expect(chime1.map((r) => r.type)).toContain('townhall_invited');

    await act(id, 'accept', as(invitee));
    await flushBackground();
    const chime2 = (
      await q('select type from notifications where recipient_id = $1', [await userId(owner.handle)])
    ).rows;
    expect(chime2.map((r) => r.type)).toContain('townhall_invite_accepted');

    const muter = await person('muter');
    const secondHall = await create(make({ visibility: 'invite' }), as(owner));
    await doAct(owner.handle, 'mute', as(muter));
    await invite(secondHall.data.townHall!.id, muter.handle, as(owner));
    await flushBackground();
    const chime3 = (
      await q('select type from notifications where recipient_id = $1', [await userId(muter.handle)])
    ).rows;
    expect(chime3.map((r) => r.type)).not.toContain('townhall_invited');
  });
});

describe('database invariants', () => {
  it('rejects a bad visibility, a bad role/status, and an owner row that is not active', async () => {
    const owner = await person('owner');
    const o = await userId(owner.handle);
    await expect(
      q(
        "insert into town_halls (owner_id, name, description, visibility) values ($1, 'A Club', 'x', 'bogus')",
        [o],
      ),
    ).rejects.toThrow(/town_halls_visibility_check/);
    const [row] = (
      await q(
        "insert into town_halls (owner_id, name, description) values ($1, 'A Club', 'x') returning id",
        [o],
      )
    ).rows;
    await expect(
      q("insert into town_hall_members (town_hall_id, user_id, role) values ($1, $2, 'bogus')", [row.id, o]),
    ).rejects.toThrow(/town_hall_members_role_check/);
    const friend = await person('friend');
    const f = await userId(friend.handle);
    await expect(
      q(
        "insert into town_hall_members (town_hall_id, user_id, role, status) values ($1, $2, 'owner', 'invited')",
        [row.id, f],
      ),
    ).rejects.toThrow(/town_hall_members_owner_active/);
  });

  it('at most one owner row per Town Hall, enforced by the database itself', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const made = await create(make(), as(owner));
    const id = made.data.townHall!.id;
    await expect(
      q(
        "insert into town_hall_members (town_hall_id, user_id, role, status) values ($1, $2, 'owner', 'active')",
        [id, await userId(friend.handle)],
      ),
    ).rejects.toThrow(/town_hall_members_one_owner_idx/);
  });

  it('deleting the owner deletes the Town Hall (cascade); deleting a regular member only drops their row', async () => {
    const owner = await person('owner');
    const made = await create(make(), as(owner));
    const id = made.data.townHall!.id;
    const joiner = await person('joiner');
    await act(id, 'join', as(joiner));

    await q('delete from users where handle = $1', [joiner.handle]);
    expect(await count()).toBe(1);
    expect(await memberCount()).toBe(1);

    await q('delete from users where handle = $1', [owner.handle]);
    expect(await count()).toBe(0);
    expect(await memberCount()).toBe(0);
  });
});
