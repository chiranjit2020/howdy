import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  listHeld,
  messageForDelivery,
  messageForReport,
  purgeOldWhispers,
  whispersExport,
} from '@/modules/whispers';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { subscribe, type DomainEvent } from '@/platform/events';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import { freshAuthState, signedInUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { bell, chimesOf, patchPrefs, texts } from '../helpers/chimes';
import {
  bodies,
  burn,
  newId,
  readTo,
  threadOf,
  threads,
  whisper,
  whisperBell,
  whisperRaw,
} from '../helpers/whispers';
import { myRanch, patchRanch, viewRanch } from '../helpers/ranch';
import { doAct, insertUser, q, userId } from '../helpers/social';

const NO_LIMIT = { consume: async () => ({ allowed: true, remaining: 999, retryAfterSec: 0 }) };
let kit: TestKit;
/** A clock the limiter reads, so a test can let the per-second allowance refill without waiting. */
let skew = 0;
const later = () => (skew += 4000);
beforeEach(async () => {
  kit = await freshAuthState();
  skew = 0;
  setRateLimiter(new MemoryRateLimiter(() => Date.now() + skew));
});
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
type P = Awaited<ReturnType<typeof person>>;
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const count = async (t: string) => (await q(`select count(*)::int n from ${t}`)).rows[0].n as number;

async function posse(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
async function friends() {
  const a = await person('alice');
  const b = await person('bob');
  await posse(a, b);
  await flushBackground();
  await q('delete from notifications');
  return { a, b };
}
/** Send and let the sender's per-second allowance refill, so a test can send many. */
async function say(from: P, to: P, body: string, clientId = newId()) {
  later();
  const r = await whisper(to.handle, body, as(from), clientId);
  expect(r.status, `${from.handle} → ${to.handle}: ${body}`).toBeLessThan(300);
  return r;
}

describe('who may whisper', () => {
  it('two people in each other’s Posse can, both ways, and each sees the whole thread', async () => {
    const { a, b } = await friends();
    await say(a, b, 'hello bob');
    await say(b, a, 'hi alice');
    expect(await bodies(b.handle, as(a))).toEqual(['hello bob', 'hi alice']);
    expect(await bodies(a.handle, as(b))).toEqual(['hello bob', 'hi alice']);
    const view = (await threadOf(b.handle, as(a))).data.messages!;
    expect(view.map((m) => m.mine)).toEqual([true, false]);
    expect(view.map((m) => m.seq)).toEqual([1, 2]);
  });

  it('strangers, pending requests, scouting, blocks, suspended people and a made-up call sign are ALL the same 404', async () => {
    const a = await person('alice');
    const stranger = await person('stranger');
    const asked = await person('asked');
    const scouted = await person('scouted');
    const villain = await person('villain');
    const gone = await person('gone');
    await doAct(asked.handle, 'request', as(a));
    await doAct(scouted.handle, 'scout', as(a));
    await doAct(villain.handle, 'block', as(a));
    await q("update users set status = 'suspended' where handle = $1", [gone.handle]);

    const missing = await whisper('nobody_here', 'hi', as(a));
    for (const other of [stranger, asked, scouted, villain, gone]) {
      later();
      const r = await whisper(other.handle, 'hi', as(a));
      expect(r.status, other.handle).toBe(404);
      expect(stable(r.data), other.handle).toBe(stable(missing.data));
      const read = await threadOf(other.handle, as(a));
      expect(read.status, other.handle).toBe(404);
    }
    later();
    expect((await whisper(a.handle, 'me', as(a))).status).toBe(404); // not to yourself
    expect(await count('messages')).toBe(0);
    expect(await count('conversations')).toBe(0); // and the attempts leave nothing behind
  });

  it('a block closes the thread for both people at once (and either way round); unblocking does not bring the Posse back', async () => {
    const { a, b } = await friends();
    await say(a, b, 'before');
    await doAct(a.handle, 'block', as(b));
    expect((await threadOf(a.handle, as(b))).status).toBe(404);
    expect((await threadOf(b.handle, as(a))).status).toBe(404);
    expect((await threads(as(a))).data.threads).toEqual([]);
    later();
    expect((await whisper(a.handle, 'x', as(b))).status).toBe(404);
    await doAct(a.handle, 'unblock', as(b));
    expect((await threadOf(a.handle, as(b))).status).toBe(404); // the Posse ended with the block
    await posse(a, b);
    expect(await bodies(a.handle, as(b))).toEqual(['before']); // the history is still there once they are Posse again
  });

  it('leaving the Posse closes the thread; a person whose request is only pending cannot whisper', async () => {
    const { a, b } = await friends();
    await say(a, b, 'hi');
    await doAct(b.handle, 'leave', as(a));
    expect((await threadOf(b.handle, as(a))).status).toBe(404);
    expect((await threads(as(b))).data.threads).toEqual([]);
  });

  it('muting or restricting does not close a thread', async () => {
    const { a, b } = await friends();
    await doAct(b.handle, 'mute', as(a));
    later();
    expect((await whisper(a.handle, 'still here', as(b))).status).toBe(201);
    expect((await threadOf(b.handle, as(a))).status).toBe(200);
  });
});

describe('what a Whisper may contain', () => {
  it('280 characters fit, 281 do not; whitespace is normalised; text is kept as text', async () => {
    const { a, b } = await friends();
    expect((await whisper(b.handle, 'a'.repeat(280), as(a))).status).toBe(201);
    later();
    const long = await whisper(b.handle, 'a'.repeat(281), as(a));
    expect(long.status).toBe(422);
    expect(long.data.error!.fields!.body).toMatch(/at most 280/i);
    later();
    expect((await whisper(b.handle, '  hello \n\t  there  ', as(a))).data.message!.body).toBe('hello there');
    later();
    expect((await whisper(b.handle, '<img src=x onerror=alert(1)>', as(a))).data.message!.body).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('empty, non-string and disguising text (bidi, zero-width, control characters) are refused; links and other scripts are fine', async () => {
    const { a, b } = await friends();
    const bad: unknown[] = [
      '',
      '   ',
      42,
      null,
      ['x'],
      `fake ${String.fromCodePoint(0x202e)}gnp.exe`,
      `inv${String.fromCodePoint(0x200b)}isible`,
      `nul${String.fromCodePoint(0)}byte`,
    ];
    for (const body of bad) {
      later();
      expect((await whisper(b.handle, body, as(a))).status, JSON.stringify(body)).toBe(422);
    }
    for (const body of ['see https://example.com/page', 'नमस्ते दोस्त', 'مرحبا 🤠']) {
      later();
      expect((await whisper(b.handle, body, as(a))).status, body).toBe(201);
    }
    expect(await count('messages')).toBe(3);
  });

  it('the server decides sender, thread, order, status and time — extra fields change nothing', async () => {
    const { a, b } = await friends();
    const other = await person('other');
    const r = await whisperRaw(
      b.handle,
      {
        clientId: newId(),
        body: 'plain',
        senderId: await userId(other.handle),
        sender_id: await userId(other.handle),
        conversationId: '00000000-0000-4000-8000-000000000000',
        seq: 999,
        status: 'held',
        createdAt: '2001-01-01T00:00:00Z',
        id: '00000000-0000-4000-8000-000000000001',
      },
      as(a),
    );
    expect(r.status).toBe(201);
    const row = (await q('select * from messages')).rows[0];
    expect(row.sender_id).toBe(await userId(a.handle));
    expect(row.seq).toBe('1');
    expect(row.status).toBe('sent');
    expect(new Date(row.created_at).getFullYear()).toBeGreaterThan(2020);
  });

  it('needs a real client id, a session and a same-origin request', async () => {
    const { a, b } = await friends();
    for (const clientId of ['', 'nope', 42, null, `${newId()}x`, "x'; drop table messages;--"]) {
      later();
      expect((await whisper(b.handle, 'hi', as(a), clientId)).status, String(clientId)).toBe(422);
    }
    later();
    expect((await whisperRaw(b.handle, { body: 'hi' }, as(a))).status).toBe(422); // no client id at all
    expect((await whisper(b.handle, 'hi', {})).status).toBe(401);
    expect((await whisper(b.handle, 'hi', { ...as(a), origin: 'https://evil.example' })).status).toBe(403);
    expect(await count('messages')).toBe(0);
  });

  it('a malformed call sign in the URL is the same 404 and never reaches a query', async () => {
    const { a } = await friends();
    for (const h of ["x'; drop table users;--", 'a', '../etc', 'x'.repeat(200), '%00']) {
      later();
      expect((await whisper(h, 'hi', as(a))).status, h).toBe(404);
      expect((await threadOf(h, as(a))).status, h).toBe(404);
    }
    expect(await count('users')).toBe(2);
  });
});

describe('numbering and safe retries', () => {
  it('sending the same client id again returns the first message — nothing new is stored and nothing rings again', async () => {
    const { a, b } = await friends();
    const id = newId();
    later();
    const first = await whisper(b.handle, 'once', as(a), id);
    later();
    const again = await whisper(b.handle, 'once', as(a), id.toUpperCase());
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.data.message).toEqual(first.data.message);
    expect(await count('messages')).toBe(1);
    await markAllRead(b);
    later();
    await whisper(b.handle, 'once', as(a), id); // a third retry
    expect(await chimesOf(as(b)).then((r) => r.data.unread)).toBe(0);
  });

  async function markAllRead(p: P) {
    const { markRead } = await import('../helpers/chimes');
    await markRead({ all: true }, as(p));
  }

  it('the same client id from two different people are two different messages', async () => {
    const { a, b } = await friends();
    const id = newId();
    await say(a, b, 'from a', id);
    await say(b, a, 'from b', id);
    expect(await count('messages')).toBe(2);
  });

  it('ten Whispers at once get ten different, consecutive numbers with nothing lost or doubled', async () => {
    const { a, b } = await friends();
    setRateLimiter(NO_LIMIT); // the burst allowance is not what is under test
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => whisper(b.handle, `msg ${i}`, as(a), newId())),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(results.map((r) => r.data.message!.seq).sort((x, y) => x - y)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(await count('messages')).toBe(10);
  });

  it('the same message sent twice at once is stored once', async () => {
    const { a, b } = await friends();
    setRateLimiter(NO_LIMIT);
    const id = newId();
    const [x, y] = await Promise.all([
      whisper(b.handle, 'twice', as(a), id),
      whisper(b.handle, 'twice', as(a), id),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 201]);
    expect(x.data.message!.seq).toBe(y.data.message!.seq);
    expect(await count('messages')).toBe(1);
  });
});

describe('Restrict: held words look sent to the sender and never reach the recipient', () => {
  it('the restricted sender sees an ordinary thread; the recipient sees nothing, is not counted, not rung, and no event announces it', async () => {
    const { a, b } = await friends();
    const seen: DomainEvent[] = [];
    const stop = subscribe(async (e) => void seen.push(e));
    await doAct(b.handle, 'restrict', as(a)); // alice restricts bob
    const normal = await say(a, b, 'from alice (normal)');
    const held = await say(b, a, 'from bob (held)');
    await flushBackground();
    stop();
    // The two answers are identical in shape: nothing tells Bob he is restricted.
    expect(Object.keys(held.data.message!).sort()).toEqual(Object.keys(normal.data.message!).sort());
    expect(held.status).toBe(normal.status);
    expect(held.data.message).toMatchObject({ mine: true });

    expect(await bodies(a.handle, as(b))).toEqual(['from alice (normal)', 'from bob (held)']); // bob sees both
    expect(await bodies(b.handle, as(a))).toEqual(['from alice (normal)']); // alice sees only her own
    expect(await whisperBell(as(a))).toBe(0);
    expect((await threads(as(a))).data.threads![0]).toMatchObject({
      unread: 0,
      last: { body: 'from alice (normal)' },
    });
    expect(await texts(as(a))).toEqual([]);
    const sent = seen.filter((e) => e.type === 'whisper.sent');
    // (Events are handled as independent after-response tasks, so compare them as a set, not in order.)
    expect(sent.map((e) => (e as { held: boolean }).held).sort()).toEqual([false, true]);
  });

  it('unrestricting does not release old held words; new ones flow normally', async () => {
    const { a, b } = await friends();
    await doAct(b.handle, 'restrict', as(a));
    await say(b, a, 'held one');
    await doAct(b.handle, 'unrestrict', as(a));
    await say(b, a, 'fresh one');
    expect(await bodies(b.handle, as(a))).toEqual(['fresh one']);
  });

  it('a thread with only held words from the other side is not in the recipient’s list', async () => {
    const { a, b } = await friends();
    await doAct(b.handle, 'restrict', as(a));
    await say(b, a, 'held');
    expect((await threads(as(a))).data.threads).toEqual([]);
    expect((await threads(as(b))).data.threads!).toHaveLength(1);
  });

  it('live delivery: the recipient is never handed held words, the sender still is', async () => {
    const { a, b } = await friends();
    await doAct(b.handle, 'restrict', as(a));
    const held = await say(b, a, 'held');
    const [conv] = (await q('select id from conversations')).rows;
    expect(await messageForDelivery(await userId(a.handle), conv.id, held.data.message!.seq)).toBeNull();
    expect(
      (await messageForDelivery(await userId(b.handle), conv.id, held.data.message!.seq))?.message.body,
    ).toBe('held');
  });
});

describe('reading, unread and the badge', () => {
  it('unread counts words from the other person; reading moves the mark; nobody else is told', async () => {
    const { a, b } = await friends();
    await say(a, b, 'one');
    await say(a, b, 'two');
    await say(b, a, 'reply');
    expect((await threads(as(b))).data.threads![0]!.unread).toBe(0); // b replied last: own send marks the thread read
    await say(a, b, 'three');
    expect((await threads(as(b))).data.threads![0]!.unread).toBe(1);
    expect(await whisperBell(as(b))).toBe(1);
    const { seenUpTo, ...view } = (await threadOf(a.handle, as(b))).data;
    expect(seenUpTo).toBe(4); // alice's own last Whisper is as far as she has read (read receipts: see below)
    expect(JSON.stringify(view)).not.toMatch(/read|seen|unread/i); // nothing else about reading is in the thread
    expect((await readTo(a.handle, 999, as(b))).data.readUpTo).toBe(4); // never beyond the last message
    expect((await readTo(a.handle, 1, as(b))).data.readUpTo).toBe(4); // never backwards
    expect(await whisperBell(as(b))).toBe(0);
    // alice's side is untouched by bob's reading
    expect((await threads(as(a))).data.threads![0]!.unread).toBe(0);
  });

  it('the badge counts threads, skips muted people and closed threads, and stops at 99', async () => {
    const me = await person('me');
    const p1 = await person('p1');
    const p2 = await person('p2');
    await posse(me, p1);
    await posse(me, p2);
    await say(p1, me, 'hi');
    await say(p2, me, 'hi');
    expect(await whisperBell(as(me))).toBe(2);
    await doAct(p2.handle, 'mute', as(me));
    expect(await whisperBell(as(me))).toBe(1);
    expect((await threads(as(me))).data.threads!.find((t) => t.handle === p2.handle)).toMatchObject({
      muted: true,
      unread: 1,
    });
    await doAct(p1.handle, 'block', as(me));
    expect(await whisperBell(as(me))).toBe(0);
  });

  it('marking read is refused for people I cannot whisper with (same 404), and validates its input', async () => {
    const { a, b } = await friends();
    const stranger = await person('stranger');
    expect((await readTo(stranger.handle, 1, as(a))).status).toBe(404);
    expect((await readTo('nobody_here', 1, as(a))).status).toBe(404);
    for (const upTo of [-1, 'x', '5', null, 1.5, 3e9, undefined]) {
      expect((await readTo(b.handle, upTo, as(a))).status, String(upTo)).toBe(422);
    }
    expect((await readTo(b.handle, 1, {})).status).toBe(401);
  });
});

describe('Seen (read receipts, ADR-021)', () => {
  const seenBy = async (handle: string, viewer: P) => (await threadOf(handle, as(viewer))).data.seenUpTo;

  it('with receipts on for both, the sender learns how far the other has read, and nothing more', async () => {
    const { a, b } = await friends();
    expect(await seenBy(b.handle, a)).toBe(0); // an empty thread already says receipts are shared, so the page watches
    const first = await say(a, b, 'one');
    await say(a, b, 'two');
    expect(await seenBy(b.handle, a)).toBe(0); // bob has read nothing yet
    await readTo(a.handle, first.data.message!.seq, as(b));
    expect(await seenBy(b.handle, a)).toBe(1);
    await readTo(a.handle, 999, as(b));
    expect(await seenBy(b.handle, a)).toBe(2);
    // the catch-up path carries it too, so an open thread sees "Seen" arrive
    expect((await threadOf(b.handle, as(a), '?after=2')).data.seenUpTo).toBe(2);
  });

  it('is reciprocal: either person switching receipts off hides "Seen" from both, and back on restores it', async () => {
    const { a, b } = await friends();
    await say(a, b, 'hi');
    await readTo(a.handle, 999, as(b));
    for (const off of [a, b]) {
      expect((await patchRanch({ readReceipts: false }, as(off))).status).toBe(200);
      expect(await seenBy(b.handle, a)).toBeUndefined();
      expect(await seenBy(a.handle, b)).toBeUndefined();
      expect((await patchRanch({ readReceipts: true }, as(off))).status).toBe(200);
    }
    expect(await seenBy(b.handle, a)).toBe(1);
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({ readReceipts: true });
  });

  it('a restricted sender never gets "Seen" — even after the other reads and replies past the held words — and cannot tell it from receipts being off', async () => {
    const { a, b } = await friends();
    await doAct(b.handle, 'restrict', as(a)); // alice restricts bob
    await say(b, a, 'held');
    await say(a, b, 'alice writes'); // alice's read mark now passes bob's held words
    await readTo(b.handle, 999, as(a));
    const restricted = (await threadOf(a.handle, as(b))).data;
    expect(restricted.seenUpTo).toBeUndefined();

    // Compare with a thread where nobody is restricted but the other person has receipts off: the same shape.
    const c = await person('carol');
    await posse(b, c);
    await say(b, c, 'to carol');
    await patchRanch({ readReceipts: false }, as(c));
    await readTo(b.handle, 999, as(c));
    const off = (await threadOf(c.handle, as(b))).data;
    expect(Object.keys(restricted).sort()).toEqual(Object.keys(off).sort());

    // Alice (who restricted) still sees how far bob has read her words: nothing about that reveals the Restrict to him.
    expect(await seenBy(b.handle, a)).toBe(1);
  });

  it('the setting is private: another person’s Porch never shows it', async () => {
    const { a, b } = await friends();
    await patchRanch({ readReceipts: false }, as(b));
    const porch = await viewRanch(b.handle, as(a));
    expect(porch.status).toBe(200);
    expect(porch.text).not.toMatch(/receipt/i);
  });
});

describe('paging a thread', () => {
  async function seed(a: P, b: P, n: number) {
    const conv = await q('select id from conversations');
    if (conv.rows.length === 0) await say(a, b, 'start');
    const id = (await q('select id from conversations')).rows[0].id;
    const from = (await q('select coalesce(max(seq), 0)::int m from messages')).rows[0].m as number;
    await q(
      `insert into messages (conversation_id, sender_id, seq, client_id, body, created_at)
       select $1, $2, $3::int + i, gen_random_uuid()::text, 'm' || ($3::int + i), now() from generate_series(1, $4::int) i`,
      [id, await userId(a.handle), from, n],
    );
    await q('update conversations set last_seq = $2 where id = $1', [id, from + n]);
  }

  it('gives the newest 30 (oldest first), then older pages with before=, and catches up with after=', async () => {
    const { a, b } = await friends();
    await seed(a, b, 44); // 45 messages including the first
    const newest = await threadOf(b.handle, as(a));
    expect(newest.data.messages).toHaveLength(30);
    expect(newest.data.hasMore).toBe(true);
    expect(newest.data.messages!.map((m) => m.seq)).toEqual(Array.from({ length: 30 }, (_, i) => 16 + i));
    const older = await threadOf(b.handle, as(a), `?before=${newest.data.messages![0]!.seq}`);
    expect(older.data.messages!.map((m) => m.seq)).toEqual(Array.from({ length: 15 }, (_, i) => 1 + i));
    expect(older.data.hasMore).toBe(false);
    const missed = await threadOf(b.handle, as(a), '?after=40');
    expect(missed.data.messages!.map((m) => m.seq)).toEqual([41, 42, 43, 44, 45]);
    const capped = await threadOf(b.handle, as(a), '?after=0&limit=10');
    expect(capped.data.messages).toHaveLength(10);
    expect(capped.data.hasMore).toBe(true);
  });

  it('bad paging parameters are 400s', async () => {
    const { a, b } = await friends();
    for (const query of [
      '?before=-1',
      '?before=x',
      '?after=1.5',
      '?limit=0',
      '?limit=51',
      '?limit=x',
      '?after=99999999999',
    ]) {
      expect((await threadOf(b.handle, as(a), query)).status, query).toBe(400);
    }
  });

  it('the list shows the newest visible line and the person’s name — never ids or emails', async () => {
    const { a, b } = await friends();
    await say(a, b, 'first');
    await say(b, a, 'the last word');
    const r = await threads(as(a));
    expect(r.data.threads![0]).toMatchObject({
      handle: b.handle,
      last: { body: 'the last word', mine: false },
    });
    expect(r.text).not.toMatch(/@example\.com|user_id|userId|conversationId|senderId/);
    expect(r.text).not.toContain(await userId(a.handle));
    expect(r.text).not.toContain(await userId(b.handle));
  });
});

describe('Burn Thread', () => {
  it('either person can delete the whole thread for both, always — and the same answer for a thread that never existed', async () => {
    const { a, b } = await friends();
    const stranger = await person('stranger');
    await say(a, b, 'secret');
    const missing = await burn('nobody_here', as(a));
    const never = await burn(stranger.handle, as(a));
    expect(never.status).toBe(200);
    expect(stable(never.data)).toBe(stable(missing.data));
    expect((await burn(a.handle, as(b))).data.burned).toBe(1);
    expect(await count('messages')).toBe(0);
    expect(await count('conversations')).toBe(0);
    expect((await burn(a.handle, as(b))).data.burned).toBe(0); // idempotent
    expect((await burn(b.handle, {})).status).toBe(401);
  });

  it('works even after a block or after leaving the Posse (ending a conversation is never gated)', async () => {
    const { a, b } = await friends();
    await say(a, b, 'x');
    await doAct(b.handle, 'block', as(a));
    expect((await burn(a.handle, as(b))).data.burned).toBe(1);
    // Alice blocked Bob: her burn is a real one.
    expect((await burn(b.handle, as(a))).data.burned).toBe(1);
    expect(await count('conversations')).toBe(0);
  });
});

describe('Burn for me (ADR-038): a blocked or restricted burner cannot wipe the other person’s copy', () => {
  /**
   * Everything the burner can observe, from burning on: answers, the thread, the list, positions, a retried client id,
   * reading, and their download. Ids and times are left out; only what could tell the two kinds of burn apart is kept.
   */
  async function burnerSees(burner: P, other: P) {
    const old = newId();
    await say(burner, other, 'before 1', old);
    await say(other, burner, 'before 2');
    const out: unknown[] = [];
    const shape = (m: { seq: number; body: string; mine: boolean }) => [m.seq, m.body, m.mine];
    out.push((await burn(other.handle, as(burner))).data);
    out.push((await burn(other.handle, as(burner))).data); // nothing left to burn
    out.push((await threadOf(other.handle, as(burner))).data);
    out.push((await threads(as(burner))).data);
    out.push(await whisperBell(as(burner)));
    later();
    const retried = await whisper(other.handle, 'retry of an old id', as(burner), old);
    out.push(retried.status, shape(retried.data.message!));
    const next = await say(burner, other, 'after 2');
    out.push(next.status, shape(next.data.message!));
    out.push((await threadOf(other.handle, as(burner))).data.messages!.map(shape));
    out.push((await threadOf(other.handle, as(burner), '?after=1')).data.messages!.map(shape));
    out.push((await threadOf(other.handle, as(burner), '?before=2')).data.messages!.map(shape));
    out.push((await readTo(other.handle, 1, as(burner))).data);
    out.push((await readTo(other.handle, 99, as(burner))).data);
    const mine = await whispersExport(await userId(burner.handle));
    out.push(
      mine.threads.map((t) => t.whispers.map((w) => [w.fromMe, w.body])),
      mine.held.length,
    );
    return JSON.parse(
      JSON.stringify(out, (k, v) =>
        k === 'handle' || k === 'displayName' || k === 'at' || k === 'portraitTint' ? undefined : v,
      ),
    ) as unknown;
  }

  it('to the burner, a restricted burn and a block-free real burn look exactly the same', async () => {
    const real = await friends();
    // A restricted person never gets "Seen", which is what receipts-off looks like (ADR-021) — so compare with that.
    expect((await patchRanch({ readReceipts: false }, as(real.a))).status).toBe(200);
    const control = await burnerSees(real.b, real.a);
    const quiet = await friends();
    await doAct(quiet.b.handle, 'restrict', as(quiet.a)); // the second Alice restricts her Bob
    const restricted = await burnerSees(quiet.b, quiet.a);
    expect(restricted).toEqual(control);
  });

  it('the person who restricted keeps the whole thread and their held tray', async () => {
    const { a, b } = await friends();
    await doAct(b.handle, 'restrict', as(a));
    const aliceSaid = await say(a, b, 'from alice');
    await say(b, a, 'held from bob');
    expect((await messageForReport(await userId(b.handle), aliceSaid.data.message!.id))?.body).toBe(
      'from alice',
    );
    expect((await burn(a.handle, as(b))).data.burned).toBe(1);
    expect(await bodies(a.handle, as(b))).toEqual([]);
    expect((await threads(as(b))).data.threads).toEqual([]);
    expect(await bodies(b.handle, as(a))).toEqual(['from alice']);
    const aliceId = await userId(a.handle);
    const tray = await listHeld(aliceId);
    expect(tray.map((h) => h.body)).toEqual(['held from bob']);
    expect((await messageForReport(aliceId, tray[0]!.id))?.body).toBe('held from bob');
    // Bob can no longer reach what he burnt, even by id (he could report Alice's Whisper before).
    const [fromAlice] = (await q(`select id from messages where body = 'from alice'`)).rows;
    expect(await messageForReport(await userId(b.handle), fromAlice.id)).toBeNull();
  });

  it('after a block, the blocker can still report what the burner sent', async () => {
    const { a, b } = await friends();
    const abuse = await say(b, a, 'abuse');
    await doAct(b.handle, 'block', as(a)); // alice blocks bob
    expect((await burn(a.handle, as(b))).data.burned).toBe(1);
    expect(await count('messages')).toBe(1);
    expect((await messageForReport(await userId(a.handle), abuse.data.message!.id))?.body).toBe('abuse');
  });

  it('a block or restrict set BY the burner does not stop a real burn', async () => {
    const { a, b } = await friends();
    await say(b, a, 'x');
    await doAct(b.handle, 'restrict', as(a)); // alice restricts bob, then alice burns
    expect((await burn(b.handle, as(a))).data.burned).toBe(1);
    expect(await count('messages')).toBe(0);
  });

  it('the burner’s new Whispers still reach the other person, each side with its own numbering', async () => {
    const { a, b } = await friends();
    await doAct(b.handle, 'restrict', as(a));
    await say(a, b, 'before');
    expect((await burn(a.handle, as(b))).data.burned).toBe(1);
    await doAct(b.handle, 'unrestrict', as(a));
    await say(b, a, 'after');
    const seqs = async (handle: string, p: P) =>
      (await threadOf(handle, as(p))).data.messages!.map((m) => [m.seq, m.body]);
    expect(await seqs(b.handle, a)).toEqual([
      [1, 'before'],
      [2, 'after'],
    ]);
    expect(await seqs(a.handle, b)).toEqual([[1, 'after']]);
    expect(await whisperBell(as(a))).toBe(1);
  });
});

describe('limits reveal nothing', () => {
  it('the per-second allowance trips the same way for a blocked person, a stranger and a made-up call sign', async () => {
    const a = await person('alice');
    const villain = await person('villain');
    const stranger = await person('stranger');
    await doAct(villain.handle, 'block', as(a));
    const run = async (handle: string) => {
      const out: number[] = [];
      for (let i = 0; i < 6; i++) out.push((await whisper(handle, `try ${i}`, as(a))).status);
      later();
      later();
      return out;
    };
    const blocked = await run(villain.handle);
    const strangers = await run(stranger.handle);
    const ghosts = await run('nobody_here');
    expect(blocked).toEqual([404, 404, 404, 429, 429, 429]);
    expect(strangers).toEqual(blocked);
    expect(ghosts).toEqual(blocked);
  });

  it('the per-thread hourly limit is never spent on someone who is blocked: 65 tries, always the same 404', async () => {
    const a = await person('alice');
    const villain = await person('villain');
    await doAct(villain.handle, 'block', as(a));
    const seen = new Set<number>();
    for (let i = 0; i < 65; i++) {
      later();
      seen.add((await whisper(villain.handle, `try ${i}`, as(a))).status);
    }
    expect([...seen]).toEqual([404]);
  });

  it('…but a real thread does stop at the hourly limit, with a Retry-After', async () => {
    const { a, b } = await friends();
    let last = 0;
    for (let i = 0; i < 62; i++) {
      later();
      last = (await whisper(b.handle, `msg ${i}`, as(a))).status;
    }
    expect(last).toBe(429);
    expect(await count('messages')).toBe(60);
  });

  it('a Whisper that is refused rings nothing and stores nothing', async () => {
    const a = await person('alice');
    const stranger = await person('stranger');
    await whisper(stranger.handle, 'hi', as(a));
    expect(await count('messages')).toBe(0);
    expect(await bell(as(stranger))).toBe(0);
  });
});

describe('Chimes for Whispers', () => {
  it('a Whisper rings the recipient once per thread (repeats re-ring, never pile up), with a link to the thread', async () => {
    const { a, b } = await friends();
    await say(a, b, 'one');
    await say(a, b, 'two');
    const list = (await chimesOf(as(b))).data.chimes!;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      type: 'whisper_received',
      text: `${a.handle} whispered to you.`,
      href: `/whispers/${a.handle}`,
      unread: true,
    });
    expect(await bell(as(a))).toBe(0);
  });

  it('a muted person, a restricted person and a switched-off kind ring nothing; a closed thread hides an old Chime', async () => {
    const { a, b } = await friends();
    await doAct(b.handle, 'mute', as(a));
    await say(b, a, 'from muted');
    expect(await bell(as(a))).toBe(0);
    await doAct(b.handle, 'unmute', as(a));
    await patchPrefs({ whispers: false }, as(a));
    await say(b, a, 'prefs off');
    expect(await bell(as(a))).toBe(0);
    await patchPrefs({ whispers: true }, as(a));
    await say(b, a, 'now on');
    expect(await bell(as(a))).toBe(1);
    await doAct(b.handle, 'leave', as(a)); // thread closed → the Chime is not shown
    expect(await bell(as(a))).toBe(0);
  });
});

describe('retention, integrity and cleanup', () => {
  it('deletes Whispers older than 7 days and threads left empty; keeps the rest', async () => {
    const { a, b } = await friends();
    const c = await person('carol');
    await posse(a, c);
    await say(a, b, 'old');
    await say(a, b, 'new');
    await say(a, c, 'only old');
    await q("update messages set created_at = now() - interval '8 days' where body in ('old', 'only old')");
    await q(
      "update conversations set last_message_at = now() - interval '8 days' where id = (select conversation_id from messages where body = 'only old')",
    );
    const gone = await purgeOldWhispers();
    expect(gone).toEqual({ messages: 2, threads: 1 });
    expect(await bodies(b.handle, as(a))).toEqual(['new']);
  });

  it('the database refuses bad rows: over-long body, unknown status, bad client id, bad order, read marks out of range, repeats', async () => {
    const { a, b } = await friends();
    await say(a, b, 'x');
    const conv = (await q('select id, user_low, user_high from conversations')).rows[0];
    const ins = (over: Record<string, unknown>) => {
      const v = { seq: 50, client_id: newId(), body: 'ok', status: 'sent', ...over };
      return q(
        'insert into messages (conversation_id, sender_id, seq, client_id, body, status) values ($1, $2, $3, $4, $5, $6)',
        [conv.id, conv.user_low, v.seq, v.client_id, v.body, v.status],
      );
    };
    await expect(ins({ body: 'x'.repeat(281) })).rejects.toThrow(/messages_body_len/);
    await expect(ins({ body: '' })).rejects.toThrow(/messages_body_len/);
    await expect(ins({ status: 'seen' })).rejects.toThrow(/messages_status_check/);
    await expect(ins({ client_id: 'not-an-id' })).rejects.toThrow(/messages_client_id_shape/);
    await expect(ins({ seq: 0 })).rejects.toThrow(/messages_seq_positive/);
    await expect(ins({ seq: 1 })).rejects.toThrow(/messages_seq_idx/); // that number is taken
    await expect(q('update conversations set low_read_seq = 99 where id = $1', [conv.id])).rejects.toThrow(
      /conversations_read_within_bounds/,
    );
    await expect(
      q('insert into conversations (user_low, user_high) values ($1, $2)', [conv.user_high, conv.user_low]),
    ).rejects.toThrow(/conversations_canonical_order/);
    await expect(
      q('insert into conversations (user_low, user_high) values ($1, $2)', [conv.user_low, conv.user_high]),
    ).rejects.toThrow(/conversations_pair_idx/);
  });

  it('deleting a person removes their threads and every Whisper in them', async () => {
    const { a, b } = await friends();
    await say(a, b, 'x');
    await say(b, a, 'y');
    await q('delete from users where handle = $1', [b.handle]);
    expect(await count('messages')).toBe(0);
    expect(await count('conversations')).toBe(0);
  });

  it('bulk people can be given threads without touching the API (sanity for the helpers used elsewhere)', async () => {
    const x = await insertUser('bulk');
    expect(x.id).toBeTruthy();
  });
});
