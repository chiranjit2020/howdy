import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { RATE } from '@/modules/fence/service';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { allBodies, fenceOf, nail } from '../helpers/fence';
import { patchRanch } from '../helpers/ranch';
import { doAct, q, userId } from '../helpers/social';

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
const cardCount = async () => (await q('select count(*)::int n from post_cards')).rows[0].n as number;

async function posse(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

describe('who may nail a card', () => {
  it('by default the Fence is readable by members but only the Posse may write on it', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await posse(owner, friend);

    const ok = await nail(owner.handle, { body: 'Howdy from a friend' }, as(friend));
    expect(ok.status).toBe(201);
    expect(ok.data.card).toMatchObject({ body: 'Howdy from a friend', mine: true, waiting: false });

    const no = await nail(owner.handle, { body: 'Hello from a stranger' }, as(stranger));
    expect(no.status).toBe(403);
    // …but the stranger can read the wall, and is told they cannot write.
    const read = await fenceOf(owner.handle, as(stranger));
    expect(read.status).toBe(200);
    expect(read.data.cards!.map((c) => c.body)).toEqual(['Howdy from a friend']);
    expect(read.data.canPost).toBe(false);
    expect((await fenceOf(owner.handle, as(friend))).data.canPost).toBe(true);
    expect(await cardCount()).toBe(1);
  });

  it('the owner can always write on their own Fence, even when nobody else may', async () => {
    const owner = await person('owner');
    await patchRanch({ fencePosting: 'nobody' }, as(owner));
    expect((await nail(owner.handle, { body: 'Mine' }, as(owner))).status).toBe(201);
    const friend = await person('friend');
    await posse(owner, friend);
    expect((await nail(owner.handle, { body: 'Not yours' }, as(friend))).status).toBe(403);
  });

  it('"members" lets any signed-in person write; a signed-out visitor never can', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    await patchRanch({ fencePosting: 'members' }, as(owner));
    expect((await nail(owner.handle, { body: 'Hi there' }, as(stranger))).status).toBe(201);
    const anon = await nail(owner.handle, { body: 'anon' }, {});
    expect(anon.status).toBe(401);
    expect(await cardCount()).toBe(1);
  });

  it('a Fence never opens wider than its Ranch: a posse-only Ranch is 404 even with an "everyone" Fence', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    await patchRanch(
      { ranchVisibility: 'posse', fenceVisibility: 'everyone', fencePosting: 'members' },
      as(owner),
    );
    expect((await fenceOf(owner.handle, as(stranger))).status).toBe(404);
    expect((await fenceOf(owner.handle)).status).toBe(404);
    expect((await nail(owner.handle, { body: 'Let me in' }, as(stranger))).status).toBe(404);
  });

  it('an "everyone" Fence can be read signed-out, read-only', async () => {
    const owner = await person('owner');
    await patchRanch({ ranchVisibility: 'everyone', fenceVisibility: 'everyone' }, as(owner));
    await nail(owner.handle, { body: 'Public words' }, as(owner));
    const r = await fenceOf(owner.handle);
    expect(r.status).toBe(200);
    expect(r.data.cards!.map((c) => c.body)).toEqual(['Public words']);
    expect(r.data.canPost).toBe(false);
    expect(r.data.cards![0]).toMatchObject({ canYo: false, canReply: false });
  });
});

describe('hidden ≡ missing (a Fence you cannot read is never confirmed)', () => {
  it('a members-only Fence looks the same signed out as a Fence that does not exist', async () => {
    const owner = await person('owner');
    const real = await fenceOf(owner.handle);
    const ghost = await fenceOf('nobody_here');
    expect(real.status).toBe(404);
    expect(stable(real.data)).toBe(stable(ghost.data));
  });

  it('a blocked person gets exactly the answer a missing Fence gives — for reading and for writing', async () => {
    const owner = await person('owner');
    const villain = await person('villain');
    await patchRanch(
      { ranchVisibility: 'everyone', fenceVisibility: 'everyone', fencePosting: 'members' },
      as(owner),
    );
    await doAct(villain.handle, 'block', as(owner));

    const read = await fenceOf(owner.handle, as(villain));
    const ghostRead = await fenceOf('nobody_here', as(villain));
    expect(read.status).toBe(404);
    expect(stable(read.data)).toBe(stable(ghostRead.data));

    const write = await nail(owner.handle, { body: 'Let me in' }, as(villain));
    const ghostWrite = await nail('nobody_here', { body: 'Let me in' }, as(villain));
    expect(write.status).toBe(404);
    expect(stable(write.data)).toBe(stable(ghostWrite.data));
    expect(await cardCount()).toBe(0);
  });

  it('the block also hides the blocked person’s Fence from the blocker', async () => {
    const owner = await person('owner');
    const villain = await person('villain');
    await patchRanch({ ranchVisibility: 'everyone', fenceVisibility: 'everyone' }, as(villain));
    expect((await fenceOf(villain.handle, as(owner))).status).toBe(200);
    await doAct(villain.handle, 'block', as(owner));
    expect((await fenceOf(villain.handle, as(owner))).status).toBe(404);
  });

  it('a suspended owner’s Fence disappears; a suspended writer cannot write', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await posse(owner, friend);
    await nail(owner.handle, { body: 'Before' }, as(friend));
    await q("update users set status = 'suspended' where handle = $1", [owner.handle]);
    expect((await fenceOf(owner.handle, as(friend))).status).toBe(404);
    await q("update users set status = 'active' where handle = $1", [owner.handle]);
    await q("update users set status = 'suspended' where handle = $1", [friend.handle]);
    expect((await nail(owner.handle, { body: 'After' }, as(friend))).status).toBe(401);
  });

  it('a card written by someone whose account later goes away is no longer shown', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await posse(owner, friend);
    await nail(owner.handle, { body: 'Gone soon' }, as(friend));
    await nail(owner.handle, { body: 'Stays' }, as(owner));
    await q("update users set status = 'suspended' where handle = $1", [friend.handle]);
    expect((await fenceOf(owner.handle, as(owner))).data.cards!.map((c) => c.body)).toEqual(['Stays']);
  });
});

describe('rate limits', () => {
  it('3 cards per hour per person per Fence (the source’s rule) — a 429 with Retry-After, and the wall is unharmed', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await posse(owner, friend);
    for (let i = 0; i < RATE.postPerFence.limit; i++) {
      expect((await nail(owner.handle, { body: `card ${i}` }, as(friend))).status).toBe(201);
    }
    const over = await nail(owner.handle, { body: 'one too many' }, as(friend));
    expect(over.status).toBe(429);
    expect(over.res.headers.get('retry-after')).not.toBeNull();
    expect(await cardCount()).toBe(RATE.postPerFence.limit);
  });

  it('a different Fence has its own allowance', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const c = await person('carol');
    await posse(a, c);
    await posse(b, c);
    for (let i = 0; i < 3; i++) await nail(a.handle, { body: `a${i}` }, as(c));
    expect((await nail(a.handle, { body: 'a3' }, as(c))).status).toBe(429);
    expect((await nail(b.handle, { body: 'b0' }, as(c))).status).toBe(201);
  });

  it('a blocked person never trips a per-Fence limit: always the same 404, however many times they try', async () => {
    const owner = await person('owner');
    const villain = await person('villain');
    await patchRanch({ fencePosting: 'members' }, as(owner));
    await doAct(villain.handle, 'block', as(owner));
    const answers = new Set<string>();
    for (let i = 0; i < RATE.postPerFence.limit + 3; i++) {
      const r = await nail(owner.handle, { body: `try ${i}` }, as(villain));
      answers.add(`${r.status}:${stable(r.data)}`);
    }
    expect(answers.size).toBe(1);
    expect([...answers][0]).toMatch(/^404:/);
  });

  it('every person also has an overall limit that is spent whatever the target is', async () => {
    const me = await person('me');
    let last = 0;
    for (let i = 0; i < RATE.postUser.limit + 1; i++) {
      last = (await nail('nobody_here', { body: `x${i}` }, as(me))).status;
    }
    expect(last).toBe(429);
  });

  it('reading is limited per viewer (scraping defence) and fails closed', async () => {
    const owner = await person('owner');
    let status = 0;
    for (let i = 0; i < RATE.readUser.limit + 1; i++)
      status = (await fenceOf(owner.handle, as(owner))).status;
    expect(status).toBe(429);
  });
});

describe('input is validated and the server decides everything else', () => {
  const setup = async () => {
    const owner = await person('owner');
    await patchRanch({ fencePosting: 'members' }, as(owner));
    const writer = await person('writer');
    return { owner, writer };
  };

  it('160 characters fit, 161 do not — the length is the visible length after normalising', async () => {
    const { owner, writer } = await setup();
    expect((await nail(owner.handle, { body: 'a'.repeat(160) }, as(writer))).status).toBe(201);
    const long = await nail(owner.handle, { body: 'a'.repeat(161) }, as(writer));
    expect(long.status).toBe(422);
    expect(long.data.error!.fields!.body).toMatch(/at most 160/i);
    expect((await nail(owner.handle, { body: `   ${'b '.repeat(70)}   ` }, as(writer))).status).toBe(201);
  });

  it('empty, whitespace-only, non-string and missing bodies are refused', async () => {
    const { owner, writer } = await setup();
    for (const body of ['', '   \n\t  ', 42, null, undefined, ['x'], { a: 1 }]) {
      const r = await nail(owner.handle, { body }, as(writer));
      expect(r.status, JSON.stringify(body)).toBe(422);
    }
    expect((await nail(owner.handle, {}, as(writer))).status).toBe(422);
    expect(await cardCount()).toBe(0);
  });

  it('links, bidi overrides, zero-width and control characters are refused; ordinary text, emoji and other scripts pass', async () => {
    const { owner, writer } = await setup();
    const bad = [
      'buy at https://spam.example',
      'visit www.spam.example now',
      'mail me at cheap.pills.com',
      `fake ${String.fromCodePoint(0x202e)}gnp.exe`,
      `inv${String.fromCodePoint(0x200b)}isible`,
      'nul\u0000byte',
      'bell\u0007',
    ];
    for (const body of bad) {
      expect((await nail(owner.handle, { body }, as(writer))).status, JSON.stringify(body)).toBe(422);
    }
    for (const body of [
      'Howdy 🤠 partner',
      'नमस्ते दोस्त',
      'مرحبا بالجميع',
      "it's 5 o'clock <b>somewhere</b>",
    ]) {
      expect((await nail(owner.handle, { body }, as(owner))).status, body).toBe(201);
    }
  });

  it('markup is stored and returned as plain text (rendering escapes it)', async () => {
    const { owner, writer } = await setup();
    const r = await nail(owner.handle, { body: '<img src=x onerror=alert(1)>' }, as(writer));
    expect(r.status).toBe(201);
    expect(r.data.card!.body).toBe('<img src=x onerror=alert(1)>');
  });

  it('extra fields cannot choose the writer, the Fence, the status or the time (no mass assignment)', async () => {
    const { owner, writer } = await setup();
    const other = await person('other');
    const otherId = await userId(other.handle);
    const r = await nail(
      owner.handle,
      {
        body: 'Just words',
        authorId: otherId,
        author_id: otherId,
        fenceOwnerId: otherId,
        status: 'pending',
        createdAt: '2001-01-01T00:00:00Z',
        id: '00000000-0000-4000-8000-000000000000',
      },
      as(writer),
    );
    expect(r.status).toBe(201);
    const row = (await q('select * from post_cards')).rows[0];
    expect(row.author_id).toBe(await userId(writer.handle));
    expect(row.fence_owner_id).toBe(await userId(owner.handle));
    expect(row.status).toBe('published');
    expect(row.id).not.toBe('00000000-0000-4000-8000-000000000000');
    expect(new Date(row.created_at).getFullYear()).toBeGreaterThan(2020);
  });

  it('needs a session and a same-origin request', async () => {
    const { owner } = await setup();
    expect((await nail(owner.handle, { body: 'hi' }, {})).status).toBe(401);
    const w = await person('w2');
    expect(
      (await nail(owner.handle, { body: 'hi' }, { cookie: w.cookie, origin: 'https://evil.example' })).status,
    ).toBe(403);
    expect(await cardCount()).toBe(0);
  });

  it('a malformed handle is the same 404 as a missing one and never reaches a query', async () => {
    const { writer } = await setup();
    for (const h of ["x'; drop table users;--", 'a', '../etc', 'x'.repeat(200), '%00']) {
      const r = await nail(h, { body: 'hi' }, as(writer));
      expect(r.status, h).toBe(404);
    }
    expect((await q('select count(*)::int n from users')).rows[0].n).toBe(2);
  });
});

describe('newest first, and paging never repeats or skips', () => {
  it('pages through 45 cards, 20 at a time, in order with no duplicates or gaps', async () => {
    const owner = await person('owner');
    const ownerId = await userId(owner.handle);
    // Bulk-insert (posting is rate limited): whole-millisecond times, as the application writes them.
    await q(
      `insert into post_cards (fence_owner_id, author_id, body, created_at)
       select $1, $1, 'card ' || lpad(i::text, 2, '0'), timestamptz '2026-01-01' + i * interval '1 second' from generate_series(0, 44) i`,
      [ownerId],
    );
    // Tie-breaking: give several cards the very same timestamp; the id must order them.
    await q(
      "update post_cards set created_at = '2030-01-01T00:00:00.000Z' where body in ('card 10','card 11','card 12','card 13')",
    );
    const seen = await allBodies(owner.handle, as(owner), 20);
    expect(seen).toHaveLength(45);
    expect(new Set(seen).size).toBe(45);
    const stamps = (
      await q('select body, created_at, id from post_cards order by created_at desc, id desc')
    ).rows.map((r) => r.body as string);
    expect(seen).toEqual(stamps);
    const small = await allBodies(owner.handle, as(owner), 7);
    expect(small).toEqual(stamps);
  });

  it('the last page has no cursor; an empty Fence gives an empty page', async () => {
    const owner = await person('owner');
    const empty = await fenceOf(owner.handle, as(owner));
    expect(empty.data).toMatchObject({ cards: [], nextCursor: null, isOwner: true });
    await nail(owner.handle, { body: 'one' }, as(owner));
    expect((await fenceOf(owner.handle, as(owner))).data.nextCursor).toBeNull();
  });

  it('tampered, oversized and out-of-range paging parameters are 400s before anything is queried', async () => {
    const owner = await person('owner');
    const bad = [
      '?cursor=%27%3B%20drop%20table%20users%3B--',
      '?cursor=' + 'A'.repeat(101),
      '?cursor=not-a-real-cursor',
      '?cursor=' + Buffer.from('1.notauuid').toString('base64url'),
      '?cursor=' +
        Buffer.from('99999999999999999999.00000000-0000-4000-8000-000000000000').toString('base64url'),
      '?limit=0',
      '?limit=-1',
      '?limit=51',
      '?limit=abc',
      '?limit=1e3',
    ];
    for (const query of bad) {
      const r = await fenceOf(owner.handle, as(owner), query);
      expect(r.status, query).toBe(400);
    }
  });

  it('a cursor grants nothing: using one from another Fence returns only this Fence’s cards, and a hidden Fence stays 404', async () => {
    const a = await person('alice');
    const b = await person('bob');
    for (let i = 0; i < 3; i++) await nail(a.handle, { body: `a${i}` }, as(a));
    for (let i = 0; i < 3; i++) await nail(b.handle, { body: `b${i}` }, as(b));
    const cursorFromA = (await fenceOf(a.handle, as(a), '?limit=1')).data.nextCursor!;
    const viaB = await fenceOf(b.handle, as(b), `?cursor=${cursorFromA}`);
    expect(viaB.status).toBe(200);
    expect(viaB.data.cards!.every((c) => c.author.handle === b.handle)).toBe(true);

    const villain = await person('villain');
    await doAct(villain.handle, 'block', as(a));
    expect((await fenceOf(a.handle, as(villain), `?cursor=${cursorFromA}`)).status).toBe(404);
  });

  it('cards from many different owners never leak into one Fence', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await nail(a.handle, { body: 'on alice' }, as(a));
    await nail(b.handle, { body: 'on bob' }, as(b));
    expect(await allBodies(a.handle, as(a))).toEqual(['on alice']);
    expect(await allBodies(b.handle, as(b))).toEqual(['on bob']);
  });
});
