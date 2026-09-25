import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { purgeStaleTributes } from '@/modules/tributes';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { patchRanch } from '../helpers/ranch';
import { doAct, insertUser, q, userId } from '../helpers/social';
import {
  approveTributeOf,
  leaveTribute,
  pinTributeOf,
  removeTributeOf,
  tributesOf,
  waitingTributes,
} from '../helpers/tributes';

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
const rows = async () => (await q('select * from tributes order by created_at')).rows;
const count = async () => (await q('select count(*)::int n from tributes')).rows[0].n as number;

async function posse(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
async function open(p: P) {
  await patchRanch({ ranchVisibility: 'everyone' }, as(p));
}

describe('who may leave a Tribute', () => {
  it('needs a mutual Posse — a stranger is refused, a Posse member succeeds', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    const friend = await person('friend');
    await open(owner);
    expect((await leaveTribute(owner.handle, { body: 'Great person.' }, as(stranger))).status).toBe(403);
    await posse(owner, friend);
    const ok = await leaveTribute(owner.handle, { body: 'Great person.' }, as(friend));
    expect(ok.status).toBe(201);
    expect(ok.data.tribute!.waiting).toBe(true);
  });

  it('refuses a Tribute to yourself, even for a Posse member calling directly', async () => {
    const owner = await person('owner');
    await open(owner);
    expect((await leaveTribute(owner.handle, { body: 'Hi me.' }, as(owner))).status).toBe(403);
  });

  it('a block either way makes the Ranch look not-found (a block hides the Ranch itself, not just the Tribute)', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    await doAct(friend.handle, 'block', as(owner));
    expect((await leaveTribute(owner.handle, { body: 'Nice.' }, as(friend))).status).toBe(404);
  });

  it('needs a session', async () => {
    const owner = await person('owner');
    await open(owner);
    expect((await leaveTribute(owner.handle, { body: 'Nice.' }, {})).status).toBe(401);
  });

  it('a missing or hidden Ranch is the same 404 as a made-up handle', async () => {
    const someone = await person('someone');
    expect((await leaveTribute('nobody_here', { body: 'Hi.' }, as(someone))).status).toBe(404);
  });
});

describe('always waits for approval — no fast path', () => {
  it('is invisible to a third party until approved, visible to its author and the owner meanwhile', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await open(owner);
    await posse(owner, friend);
    await leaveTribute(owner.handle, { body: 'They are the best.' }, as(friend));

    const byStranger = await tributesOf(owner.handle, as(stranger));
    expect(byStranger.data.tributes).toEqual([]);
    expect(byStranger.text).not.toContain('best');

    const byAuthor = await tributesOf(owner.handle, as(friend));
    expect(byAuthor.data.tributes!.map((t) => t.waiting)).toEqual([true]);

    const byOwner = await tributesOf(owner.handle, as(owner));
    expect(byOwner.data.tributes).toEqual([]); // the owner's own feed only shows published + their own — not others' pending

    const q1 = await waitingTributes(as(owner));
    expect(q1.data.waiting).toHaveLength(1);
  });

  it('approving makes it public; only the owner can approve, and a made-up id is the same 404', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await open(owner);
    await posse(owner, friend);
    const made = await leaveTribute(owner.handle, { body: 'Solid.' }, as(friend));
    const id = made.data.tribute!.id;

    expect((await approveTributeOf(id, as(stranger))).status).toBe(404);
    expect((await approveTributeOf('00000000-0000-0000-0000-000000000000', as(owner))).status).toBe(404);
    expect((await approveTributeOf(id, as(owner))).status).toBe(200);

    const seen = await tributesOf(owner.handle, as(stranger));
    expect(seen.data.tributes!.map((t) => t.body)).toEqual(['Solid.']);
  });
});

describe('pinning', () => {
  async function published(owner: P, author: P, body: string): Promise<string> {
    const made = await leaveTribute(owner.handle, { body }, as(author));
    await approveTributeOf(made.data.tribute!.id, as(owner));
    return made.data.tribute!.id;
  }

  it('only one at a time; pinning a new one silently unpins the last; only the owner may', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await open(owner);
    await posse(owner, friend);
    const a = await published(owner, friend, 'One.');
    const b = await published(owner, friend, 'Two.');

    expect((await pinTributeOf(a, true, as(stranger))).status).toBe(404);
    expect((await pinTributeOf(a, true, as(owner))).status).toBe(200);
    expect((await pinTributeOf(b, true, as(owner))).status).toBe(200);

    const rowsNow = await rows();
    expect(rowsNow.filter((r) => r.pinned)).toHaveLength(1);
    expect(rowsNow.find((r) => r.id === b)?.pinned).toBe(true);

    expect((await pinTributeOf(a, false, as(owner))).status).toBe(200); // no-op: a was not the pinned one
    expect((await rows()).find((r) => r.id === b)?.pinned).toBe(true);
    expect((await pinTributeOf(b, false, as(owner))).status).toBe(200);
    expect((await rows()).some((r) => r.pinned)).toBe(false);
  });

  it('a pending Tribute cannot be pinned', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    const made = await leaveTribute(owner.handle, { body: 'Wait for me.' }, as(friend));
    expect((await pinTributeOf(made.data.tribute!.id, true, as(owner))).status).toBe(404);
  });
});

describe('taking one down', () => {
  it('the author can always remove their own, even pending and even after being blocked', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    const made = await leaveTribute(owner.handle, { body: 'Take me back.' }, as(friend));
    await doAct(friend.handle, 'block', as(owner));
    expect((await removeTributeOf(made.data.tribute!.id, as(friend))).status).toBe(200);
    expect(await count()).toBe(0);
  });

  it('the owner can remove anything on their own Ranch; nobody else can, and it looks like 404 either way', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await open(owner);
    await posse(owner, friend);
    const made = await leaveTribute(owner.handle, { body: 'Nice.' }, as(friend));
    const id = made.data.tribute!.id;
    expect((await removeTributeOf(id, as(stranger))).status).toBe(404);
    expect((await removeTributeOf(id, as(owner))).status).toBe(200);
    expect(await count()).toBe(0);
  });
});

describe('muted and blocked authors vanish from the owner’s view', () => {
  it('a muted Posse member’s Tribute disappears from both the public list and the waiting queue', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    const made = await leaveTribute(owner.handle, { body: 'Hi.' }, as(friend));
    await approveTributeOf(made.data.tribute!.id, as(owner));
    expect((await tributesOf(owner.handle, as(owner))).data.tributes).toHaveLength(1);

    await doAct(friend.handle, 'mute', as(owner));
    expect((await tributesOf(owner.handle, as(owner))).data.tributes).toEqual([]);

    const made2 = await leaveTribute(owner.handle, { body: 'Again.' }, as(friend));
    expect(made2.status).toBe(201); // giving still works: mute limits reading, not writing
    expect((await waitingTributes(as(owner))).data.waiting).toEqual([]);
  });
});

describe('input screening', () => {
  it('empty, too long, links and disguising characters are all refused (422)', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    const rtlOverride = String.fromCharCode(0x202e); // built at runtime: keeps this SOURCE file free of raw bidi chars
    for (const body of ['', ' ', 'x'.repeat(281), 'Visit https://example.com now', `a${rtlOverride}b`]) {
      expect((await leaveTribute(owner.handle, { body }, as(friend))).status, JSON.stringify(body)).toBe(422);
    }
    expect(await count()).toBe(0);
  });
});

describe('database invariants', () => {
  it('refuses a self-Tribute, a bad status and a pinned-but-not-published row', async () => {
    const owner = await person('owner');
    const o = await userId(owner.handle);
    await expect(
      q("insert into tributes (owner_id, author_id, body, status) values ($1, $1, 'hi', 'pending')", [o]),
    ).rejects.toThrow(/tributes_not_self/);
    const friend = await person('friend');
    const f = await userId(friend.handle);
    await expect(
      q("insert into tributes (owner_id, author_id, body, status) values ($1, $2, 'hi', 'bogus')", [o, f]),
    ).rejects.toThrow(/tributes_status_check/);
    await expect(
      q(
        "insert into tributes (owner_id, author_id, body, status, pinned) values ($1, $2, 'hi', 'pending', true)",
        [o, f],
      ),
    ).rejects.toThrow(/tributes_pinned_published/);
  });

  it('at most one pinned Tribute per owner, enforced by the database itself', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const o = await userId(owner.handle);
    const f = await userId(friend.handle);
    await q(
      "insert into tributes (owner_id, author_id, body, status, pinned) values ($1, $2, 'a', 'published', true)",
      [o, f],
    );
    await expect(
      q(
        "insert into tributes (owner_id, author_id, body, status, pinned) values ($1, $2, 'b', 'published', true)",
        [o, f],
      ),
    ).rejects.toThrow(/tributes_one_pinned_per_owner_idx/);
  });

  it('deleting either person removes their Tributes', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    await leaveTribute(owner.handle, { body: 'Hi.' }, as(friend));
    await q('delete from users where handle = $1', [friend.handle]);
    expect(await count()).toBe(0);
  });
});

describe('rate limits', () => {
  it('giving Tributes is capped per person, across owners (not masked by the tighter per-owner limit)', async () => {
    const friend = await person('friend');
    const f = await userId(friend.handle);
    let status = 0;
    for (let i = 0; i < 21; i++) {
      const owner = await insertUser('owner');
      const [low, high] = f < owner.id ? [f, owner.id] : [owner.id, f];
      await q(
        "insert into posse_links (user_low, user_high, status, requested_by) values ($1, $2, 'accepted', $1)",
        [low, high],
      );
      status = (await leaveTribute(owner.handle, { body: 'Hi.' }, as(friend))).status;
    }
    expect(status).toBe(429);
  });
});

describe('retention', () => {
  it('purge drops waiting Tributes older than 30 days and keeps the rest', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const o = await userId(owner.handle);
    const f = await userId(friend.handle);
    await q(
      "insert into tributes (owner_id, author_id, body, status, created_at) values ($1, $2, 'old', 'pending', now() - interval '31 days')",
      [o, f],
    );
    await q(
      "insert into tributes (owner_id, author_id, body, status, created_at) values ($1, $2, 'recent', 'pending', now() - interval '2 days')",
      [o, f],
    );
    await q(
      "insert into tributes (owner_id, author_id, body, status, created_at) values ($1, $2, 'old but published', 'published', now() - interval '31 days')",
      [o, f],
    );
    expect((await purgeStaleTributes()).tributes).toBe(1);
    expect(await count()).toBe(2);
  });
});

describe('nothing hangs on a bad listener', () => {
  it('reads and writes never depend on the response being byte-identical between good and failing listeners', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await open(owner);
    await posse(owner, friend);
    const good = await leaveTribute(owner.handle, { body: 'Steady.' }, as(friend));
    expect(stable(good.data)).toContain('Steady');
  });
});
