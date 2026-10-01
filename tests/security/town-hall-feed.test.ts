import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTO_HOLD_REPORTERS } from '@/modules/moderation/anti-spam';
import { purgeStaleHeld } from '@/modules/town-halls';
import { FEED_RATE } from '@/modules/town-halls/feed';
import { getPool } from '@/platform/db';
import { REPLIES_PER_CARD } from '@/shared/validation/fence';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { chimesOf } from '../helpers/chimes';
import {
  approvePost,
  approveReply,
  feed,
  held,
  post,
  react,
  removePost,
  removeReply,
  reply,
  reportPost,
} from '../helpers/hall-feed';
import { actOnReport, makeRole, queue, type QueueItem } from '../helpers/moderation';
import { doAct, q, report } from '../helpers/social';
import { act, create, invite } from '../helpers/town-halls';

/** ADR-033: a Town Hall's members-only feed — who can read and write it, and every protection the Fence has. */

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

/** An open Town Hall owned by `owner`, with `members` joined. */
async function hall(owner: P, members: P[] = [], visibility = 'open'): Promise<string> {
  const id = (
    await create({ name: 'Porch Talk', description: 'Chatting on the porch.', visibility }, as(owner))
  ).data.townHall!.id;
  for (const m of members) {
    if (visibility === 'invite') {
      await invite(id, m.handle, as(owner));
      await act(id, 'accept', as(m));
    } else await act(id, 'join', as(m));
  }
  return id;
}

const ids = async (hallId: string, who: P) => (await feed(hallId, as(who))).data.posts!.map((p) => p.id);

async function reportedBy(n: number, target: P) {
  for (let i = 0; i < n; i++)
    await report({ handle: target.handle, reason: 'spam' }, as(await person(`r${i}`)));
}

describe('who can read and write the feed', () => {
  it('active members post and read; newest first', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const first = await post(id, { body: 'Howdy, folks!' }, as(ann));
    expect(first.status).toBe(201);
    expect(first.data.post).toMatchObject({
      body: 'Howdy, folks!',
      mine: true,
      canRemove: true,
      canReact: false,
    });
    await post(id, { body: 'Welcome in.' }, as(owner));
    const page = await feed(id, as(ann));
    expect(page.status).toBe(200);
    expect(page.data.posts!.map((p) => p.body)).toEqual(['Welcome in.', 'Howdy, folks!']);
  });

  it('non-members (open or invite-only), former members and made-up ids all get the same 404; signed out is 401', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    const leaver = await person('leaver');
    const open = await hall(owner, [leaver]);
    const secret = await hall(owner, [], 'invite');
    await post(open, { body: 'members only' }, as(owner));
    await act(open, 'leave', as(leaver));

    for (const [who, hallId] of [
      [stranger, open],
      [stranger, secret],
      [leaver, open],
      [stranger, '00000000-0000-4000-8000-000000000000'],
      [stranger, 'not-a-uuid'],
    ] as const) {
      const read = await feed(hallId, as(who));
      const write = await post(hallId, { body: 'let me in' }, as(who));
      expect([read.status, write.status], `${who.handle} ${hallId}`).toEqual([404, 404]);
      expect(read.data.error!.code).toBe('NOT_FOUND');
    }
    expect((await feed(open, {})).status).toBe(401);
    expect((await q('select count(*)::int n from town_hall_posts')).rows[0].n).toBe(1);
  });

  it('an invited (not yet accepted) person cannot read it', async () => {
    const owner = await person('owner');
    const guest = await person('guest');
    const id = await hall(owner, [], 'invite');
    await invite(id, guest.handle, as(owner));
    expect((await feed(id, as(guest))).status).toBe(404);
  });

  it('refuses empty, too-long, linked and disguised posts', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    for (const body of [
      '',
      '   ',
      'x'.repeat(281),
      'see example.com',
      'a' + String.fromCharCode(0x202e) + 'b',
    ]) {
      expect((await post(id, { body }, as(owner))).status, JSON.stringify(body)).toBe(422);
    }
    expect((await post(id, { body: 'x'.repeat(280) }, as(owner))).status).toBe(201);
  });

  it('pages with an opaque cursor; a bad cursor is a 400', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    for (let i = 0; i < 3; i++) await post(id, { body: `post ${i}` }, as(owner));
    const one = await feed(id, as(owner), '?limit=2');
    expect(one.data.posts!.map((p) => p.body)).toEqual(['post 2', 'post 1']);
    const two = await feed(id, as(owner), `?limit=2&cursor=${one.data.nextCursor}`);
    expect(two.data.posts!.map((p) => p.body)).toEqual(['post 0']);
    expect(two.data.nextCursor).toBeNull();
    expect((await feed(id, as(owner), '?cursor=garbage!')).status).toBe(400);
  });

  it('is rate limited per person per Town Hall', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    let status = 0;
    for (let i = 0; i <= FEED_RATE.postPerHall.limit; i++)
      status = (await post(id, { body: `p${i}` }, as(owner))).status;
    expect(status).toBe(429);
  });
});

describe('replies and reactions', () => {
  it('members reply and react; one reaction per person, switchable; never on your own post', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const p = (await post(id, { body: 'Who is in for Sunday?' }, as(ann))).data.post!;

    expect((await reply(p.id, { body: 'Me!' }, as(bob))).status).toBe(201);
    expect((await react(p.id, { on: true }, as(bob))).data.myReaction).toBe('yo');
    expect((await react(p.id, { on: true, kind: 'fire' }, as(bob))).data.myReaction).toBe('fire');
    expect((await react(p.id, { on: true, kind: 'love' }, as(owner))).status).toBe(200);
    expect((await react(p.id, { on: true }, as(ann))).status).toBe(400);

    const seen = (await feed(id, as(ann))).data.posts![0]!;
    expect(seen.reactions).toMatchObject({ yo: 0, fire: 1, love: 1 });
    expect(seen.replies.map((r) => r.body)).toEqual(['Me!']);
    expect((await react(p.id, { on: false }, as(bob))).data.myReaction).toBeNull();
    expect((await feed(id, as(ann))).data.posts![0]!.reactions.fire).toBe(0);
  });

  it('a non-member cannot reply to, react to or report a post (404)', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    const id = await hall(owner);
    const p = (await post(id, { body: 'hi' }, as(owner))).data.post!;
    expect((await reply(p.id, { body: 'sneaky' }, as(stranger))).status).toBe(404);
    expect((await react(p.id, { on: true }, as(stranger))).status).toBe(404);
    expect((await reportPost(p.id, { reason: 'spam' }, as(stranger))).status).toBe(404);
  });

  it(`a post holds at most ${REPLIES_PER_CARD} replies`, async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    const p = (await post(id, { body: 'Count off' }, as(owner))).data.post!;
    await q(
      `insert into town_hall_replies (post_id, author_id, body)
       select $1, author_id, 'r' from town_hall_posts, generate_series(1, $2) where id = $1`,
      [p.id, REPLIES_PER_CARD],
    );
    expect((await reply(p.id, { body: 'one more' }, as(owner))).status).toBe(409);
  });
});

describe('taking things down', () => {
  it('the writer and the owner can; another member cannot (404, as if it did not exist)', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const a = (await post(id, { body: 'from ann' }, as(ann))).data.post!;
    const b = (await post(id, { body: 'from bob' }, as(bob))).data.post!;
    const r = (await reply(a.id, { body: 'bob says' }, as(bob))).data.reply!;

    expect((await removePost(a.id, as(bob))).status).toBe(404);
    expect((await removeReply(r.id, as(ann))).status).toBe(404); // the post's writer is not the reply's
    expect((await removeReply(r.id, as(owner))).status).toBe(200);
    expect((await removePost(b.id, as(owner))).status).toBe(200);
    expect((await removePost(a.id, as(ann))).status).toBe(200);
    expect(await ids(id, owner)).toEqual([]);
  });

  it('a writer can still take back a post after leaving the Town Hall', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const a = (await post(id, { body: 'bye soon' }, as(ann))).data.post!;
    await act(id, 'leave', as(ann));
    expect(await ids(id, owner)).toEqual([a.id]); // leaving keeps what you posted
    expect((await removePost(a.id, as(ann))).status).toBe(200);
    expect(await ids(id, owner)).toEqual([]);
  });

  it('deleting the Town Hall deletes its feed', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    await post(id, { body: 'gone soon' }, as(owner));
    await q('delete from town_halls where id = $1', [id]);
    expect((await q('select count(*)::int n from town_hall_posts')).rows[0].n).toBe(0);
  });
});

describe('blocks and mutes', () => {
  it("hide that person's posts and replies from me, and stop me reaching their posts", async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const a = (await post(id, { body: 'from ann' }, as(ann))).data.post!;
    const b = (await post(id, { body: 'from bob' }, as(bob))).data.post!;
    await reply(a.id, { body: 'bob replies' }, as(bob));

    await doAct(bob.handle, 'block', as(ann));
    expect(await ids(id, ann)).toEqual([a.id]);
    expect((await feed(id, as(ann))).data.posts![0]!.replies).toEqual([]);
    // Blocks work both ways: bob no longer sees ann's post either.
    expect(await ids(id, bob)).toEqual([b.id]);
    expect((await reply(a.id, { body: 'still here?' }, as(bob))).status).toBe(404);
    expect((await react(a.id, { on: true }, as(bob))).status).toBe(404);
    // Everyone else still sees both.
    expect((await ids(id, owner)).sort()).toEqual([a.id, b.id].sort());
  });

  it('a muted writer drops out of my feed only', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    await post(id, { body: 'from ann' }, as(ann));
    await doAct(ann.handle, 'mute', as(owner));
    expect(await ids(id, owner)).toEqual([]);
    expect(await ids(id, ann)).toHaveLength(1);
  });

  it('a suspended writer disappears from the feed', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    await post(id, { body: 'from ann' }, as(ann));
    await q("update users set status = 'suspended' where handle = $1", [ann.handle]);
    expect(await ids(id, owner)).toEqual([]);
  });
});

describe('auto-hold (ADR-024) in a Town Hall', () => {
  it(`${AUTO_HOLD_REPORTERS} reporters: posts and replies wait for the owner, looking posted to the writer`, async () => {
    const owner = await person('owner');
    const target = await person('target');
    const bob = await person('bob');
    const id = await hall(owner, [target, bob]);
    const open = (await post(id, { body: 'before' }, as(bob))).data.post!;
    await reportedBy(AUTO_HOLD_REPORTERS, target);

    const p = await post(id, { body: 'held post' }, as(target));
    expect(p.status).toBe(201);
    const r = await reply(open.id, { body: 'held reply' }, as(target));
    expect(r.status).toBe(201);

    // The writer sees both, as if posted.
    expect(await ids(id, target)).toContain(p.data.post!.id);
    expect((await feed(id, as(target))).data.posts!.find((x) => x.id === open.id)!.replies).toHaveLength(1);
    // Other members see neither.
    expect(await ids(id, bob)).not.toContain(p.data.post!.id);
    expect((await feed(id, as(bob))).data.posts!.find((x) => x.id === open.id)!.replies).toHaveLength(0);
    // And it rang nobody.
    expect((await chimesOf(as(bob))).data.chimes!.map((c) => c.type)).not.toContain('hall_reply_created');

    // Only the owner sees the held tray.
    expect((await held(id, as(bob))).status).toBe(404);
    const tray = await held(id, as(owner));
    expect((tray.data.posts as { id: string }[]).map((x) => x.id)).toEqual([p.data.post!.id]);
    expect(tray.data.replies!.map((x) => x.onPost)).toEqual(['before']);

    // Only the owner can let them through.
    expect((await approvePost(p.data.post!.id, as(bob))).status).toBe(404);
    expect((await approveReply(r.data.reply!.id, as(bob))).status).toBe(404);
    expect((await approvePost(p.data.post!.id, as(owner))).status).toBe(200);
    expect((await approveReply(r.data.reply!.id, as(owner))).status).toBe(200);
    expect(await ids(id, bob)).toContain(p.data.post!.id);
    expect((await feed(id, as(bob))).data.posts!.find((x) => x.id === open.id)!.replies).toHaveLength(1);
  });

  it('one reporter fewer holds nothing, and the owner is never held in their own Town Hall', async () => {
    const owner = await person('owner');
    const target = await person('target');
    const bob = await person('bob');
    const id = await hall(owner, [target, bob]);
    await reportedBy(AUTO_HOLD_REPORTERS - 1, target);
    const p = (await post(id, { body: 'fine' }, as(target))).data.post!;
    expect(await ids(id, bob)).toContain(p.id);

    await reportedBy(AUTO_HOLD_REPORTERS, owner);
    const o = (await post(id, { body: 'owner speaks' }, as(owner))).data.post!;
    expect(await ids(id, bob)).toContain(o.id);
  });

  it('held posts nobody answered are dropped after 30 days; published ones stay', async () => {
    const owner = await person('owner');
    const target = await person('target');
    const id = await hall(owner, [target]);
    const keep = (await post(id, { body: 'published' }, as(target))).data.post!;
    await reportedBy(AUTO_HOLD_REPORTERS, target);
    await post(id, { body: 'held' }, as(target));
    await q("update town_hall_posts set created_at = now() - interval '31 days'");
    expect(await purgeStaleHeld()).toEqual({ posts: 1, replies: 0 });
    expect(await ids(id, owner)).toEqual([keep.id]);
  });
});

describe('reporting a post (ADR-025)', () => {
  it('goes against its writer with the words kept; a moderator can remove it', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const mod = await person('mod');
    await makeRole(mod.handle, 'moderator');
    const id = await hall(owner, [ann, bob]);
    const p = (await post(id, { body: 'something rude' }, as(ann))).data.post!;

    expect((await reportPost(p.id, { reason: 'harassment' }, as(ann))).status).toBe(404); // not your own
    expect((await reportPost(p.id, { reason: 'harassment' }, as(bob))).status).toBe(202);
    const item = ((await queue(as(mod))).data.reports as QueueItem[])[0]!;
    expect(item).toMatchObject({ subject: 'hall_post', evidenceText: 'something rude', canRemove: true });
    expect(item.target!.handle).toBe(ann.handle);

    // Only a removal that matches the subject works.
    expect((await actOnReport(item.id, { action: 'remove_town_hall' }, as(mod))).status).toBe(400);
    expect((await actOnReport(item.id, { action: 'remove_hall_post' }, as(mod))).status).toBe(200);
    expect(await ids(id, owner)).toEqual([]);
    const row = (await q('select status, evidence_text, hall_post_id from reports')).rows[0];
    expect(row).toEqual({ status: 'actioned', evidence_text: 'something rude', hall_post_id: null });
  });
});

describe('Chimes (ADR-033)', () => {
  it("a reply or a new reaction rings the post's writer only, linking to the Town Hall", async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const p = (await post(id, { body: 'Sunday?' }, as(ann))).data.post!;
    await reply(p.id, { body: 'Yes' }, as(bob));
    await react(p.id, { on: true }, as(bob));
    await react(p.id, { on: false }, as(bob));
    await react(p.id, { on: true, kind: 'fire' }, as(bob)); // re-giving never rings twice
    await reply(p.id, { body: 'my own' }, as(ann)); // nobody is Chimed about their own reply

    const mine = (await chimesOf(as(ann))).data.chimes!;
    expect(mine.map((c) => c.type).sort()).toEqual(['hall_reaction_given', 'hall_reply_created']);
    expect(new Set(mine.map((c) => c.href))).toEqual(new Set([`/town-halls/${id}`]));
    expect(mine.map((c) => c.text)).toContain(`${bob.handle} replied to your post in a Town Hall.`);
    // Other members (the owner included) are not rung for every reply.
    expect((await chimesOf(as(owner))).data.chimes).toEqual([]);
  });

  it('vanish once I leave the Town Hall, or the post is taken down', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const p1 = (await post(id, { body: 'one' }, as(ann))).data.post!;
    await reply(p1.id, { body: 'hi' }, as(bob));
    expect((await chimesOf(as(ann))).data.chimes).toHaveLength(1);
    await removePost(p1.id, as(owner));
    expect((await chimesOf(as(ann))).data.chimes).toEqual([]);

    const p2 = (await post(id, { body: 'two' }, as(ann))).data.post!;
    await react(p2.id, { on: true }, as(bob));
    expect((await chimesOf(as(ann))).data.chimes).toHaveLength(1);
    await act(id, 'leave', as(ann));
    expect((await chimesOf(as(ann))).data.chimes).toEqual([]);
  });

  it('the Town Halls Chime switch silences them', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    await q(
      `insert into notification_prefs (user_id, townhalls) select id, false from users where handle = $1`,
      [ann.handle],
    );
    const p = (await post(id, { body: 'quiet please' }, as(ann))).data.post!;
    await reply(p.id, { body: 'ok' }, as(owner));
    expect((await chimesOf(as(ann))).data.chimes).toEqual([]);
  });
});
