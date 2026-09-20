import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authHandlers } from '@/modules/auth';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import { publishToUser } from '@/platform/realtime';
import { createRealtimeServer, type RealtimeServer } from '@/realtime/server';
import { CLOSE, MAX_FRAME_BYTES } from '@/shared/ws';
import { call, freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { doAct, q, userId } from '../helpers/social';
import { bodies, newId, whisper } from '../helpers/whispers';
import { WsClient } from '../helpers/ws-client';

let kit: TestKit;
let server: RealtimeServer;
let port: number;
const clients: WsClient[] = [];
let skew = 0;
const later = () => (skew += 4000);

beforeAll(async () => {
  server = createRealtimeServer({
    port: 0,
    appUrl: 'http://localhost:3000',
    redisUrl: process.env.REDIS_URL,
    trustProxyHops: 1,
    maxConnectionsPerUser: 3,
    maxConnectionsPerIp: 12,
    revalidateMs: 150,
    heartbeatMs: 60_000,
    framesPerSecond: 20,
    burst: 12,
  });
  port = await server.listen();
});
afterAll(async () => {
  await server.close();
  await getPool().end();
});
beforeEach(async () => {
  kit = await freshAuthState();
  skew = 0;
  setRateLimiter(new MemoryRateLimiter(() => Date.now() + skew));
});
afterEach(() => {
  for (const c of clients.splice(0)) c.close();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
type P = Awaited<ReturnType<typeof person>>;
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const connect = async (p: P, opts: { origin?: string | null; cookie?: string } = {}) => {
  const c = await WsClient.open(port, {
    cookie: opts.cookie ?? p.cookie,
    ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
  });
  clients.push(c);
  return c;
};
async function friends() {
  const a = await person('alice');
  const b = await person('bob');
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
  await flushBackground();
  return { a, b };
}
const isMsg = (f: { type: string }) => f.type === 'whisper.message';

describe('the connection is refused before it exists unless it is clearly one of ours', () => {
  it('needs the site’s own Origin: a page on another site cannot open a socket with your cookies', async () => {
    const a = await person('alice');
    for (const origin of [
      'https://evil.example',
      'http://localhost:3001',
      'http://localhost:3000.evil.example',
      null,
    ]) {
      await expect(WsClient.open(port, { cookie: a.cookie, origin }), String(origin)).rejects.toThrow(
        'HTTP 403',
      );
    }
    expect(server.stats().connections).toBe(0);
  });

  it('needs a live session: no cookie, a made-up cookie and an ended session are all 401', async () => {
    const a = await person('alice');
    await expect(WsClient.open(port, {})).rejects.toThrow('HTTP 401');
    await expect(WsClient.open(port, { cookie: 'howdy_session=not-a-real-token' })).rejects.toThrow(
      'HTTP 401',
    );
    await call(authHandlers.logout, 'POST', '/api/auth/logout', {}, as(a));
    await expect(WsClient.open(port, { cookie: a.cookie })).rejects.toThrow('HTTP 401');
  });

  it('only /ws exists', async () => {
    const a = await person('alice');
    await expect(WsClient.open(port, { cookie: a.cookie, path: '/anything' })).rejects.toThrow('HTTP 404');
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${port}/other`)).status).toBe(404);
  });

  it('caps connections per person, and gives the place back when one closes', async () => {
    const a = await person('alice');
    const open = [await connect(a), await connect(a), await connect(a)];
    await expect(WsClient.open(port, { cookie: a.cookie })).rejects.toThrow('HTTP 429');
    open[0]!.close();
    await open[0]!.waitClosed();
    await expect.poll(() => server.stats().connections).toBe(2);
    expect(await connect(a)).toBeTruthy();
  });

  it('greets every connection with a versioned "ready" frame, and numbers what it sends', async () => {
    const a = await person('alice');
    const c = await connect(a);
    const pong1 = await c.request('ping', {});
    const pong2 = await c.request('ping', {});
    expect(pong1).toMatchObject({ v: 1, op: 'ACK', type: 'ping' });
    expect(typeof pong1.serverTime).toBe('number');
    expect(pong2.seq).toBe(pong1.seq + 1); // ready was 1, then these
    expect(pong1.seq).toBe(2);
  });
});

describe('what a connection may send', () => {
  it('bad JSON, wrong version, unknown types and extra nesting are refused with an ERR, and the connection lives on', async () => {
    const a = await person('alice');
    const c = await connect(a);
    const rid = randomUUID();
    for (const raw of [
      'not json',
      '[]',
      '"x"',
      JSON.stringify({ v: 2, op: 'ACTION', type: 'ping', requestId: rid, d: {} }),
      JSON.stringify({ v: 1, op: 'EVENT', type: 'ping', requestId: rid, d: {} }),
      JSON.stringify({ v: 1, op: 'ACTION', type: 'whisper.delete', requestId: rid, d: {} }),
      JSON.stringify({ v: 1, op: 'ACTION', type: 'ping', d: {} }),
      JSON.stringify({ v: 1, op: 'ACTION', type: 'ping', requestId: 'has spaces!', d: {} }),
      JSON.stringify({ v: 1, op: 'ACTION', type: 'whisper.read', requestId: rid, d: { handle: 'x' } }),
    ]) {
      c.sendRaw(raw);
      const f = await c.next((x) => x.op === 'ERR');
      expect(f.d.code, raw).toMatch(/BAD_REQUEST|VALIDATION_FAILED/);
    }
    expect((await c.request('ping', {})).op).toBe('ACK');
  });

  it('binary frames are refused; an oversized frame closes the connection', async () => {
    const a = await person('alice');
    const c = await connect(a);
    c.sendRaw(Buffer.from([1, 2, 3]), true);
    expect((await c.next((f) => f.op === 'ERR')).d.code).toBe('BAD_REQUEST');
    c.sendRaw(
      JSON.stringify({
        v: 1,
        op: 'ACTION',
        type: 'ping',
        requestId: 'x',
        d: {},
        pad: 'a'.repeat(MAX_FRAME_BYTES),
      }),
    );
    expect(await c.waitClosed()).toBe(1009);
  });

  it('a Whisper that is too long, empty, or aimed at a malformed call sign gets field-level errors', async () => {
    const { a, b } = await friends();
    const c = await connect(a);
    const long = await c.request('whisper.send', {
      handle: b.handle,
      clientId: newId(),
      body: 'x'.repeat(281),
    });
    expect(long).toMatchObject({ op: 'ERR' });
    expect(long.d.fields?.body).toMatch(/at most 280/i);
    const empty = await c.request('whisper.send', { handle: b.handle, clientId: newId(), body: '   ' });
    expect(empty.d.fields?.body).toBeTruthy();
    const badHandle = await c.request('whisper.send', {
      handle: "x'; drop table users;--",
      clientId: newId(),
      body: 'hi',
    });
    expect(badHandle.op).toBe('ERR');
    const badId = await c.request('whisper.send', { handle: b.handle, clientId: 'nope', body: 'hi' });
    expect(badId.d.fields?.clientId).toBeTruthy();
    const noExtras = await c.request('whisper.send', {
      handle: b.handle,
      clientId: newId(),
      body: 'hi',
      senderId: 'x',
    });
    expect(noExtras.op).toBe('ACK'); // unknown keys are dropped, not obeyed
    expect((await q('select count(*)::int n from messages')).rows[0].n).toBe(1);
  });

  it('too many frames too fast: warned first, then disconnected', async () => {
    const a = await person('alice');
    const c = await connect(a);
    for (let i = 0; i < 80; i++)
      c.sendRaw(JSON.stringify({ v: 1, op: 'ACTION', type: 'ping', requestId: `p${i}`, d: {} }));
    expect((await c.next((f) => f.d.code === 'RATE_LIMITED')).op).toBe('ERR');
    expect(await c.waitClosed()).toBe(CLOSE.ABUSE);
  });
});

describe('sending and receiving live', () => {
  it('a Whisper sent over the socket is stored, acknowledged, and pushed to the other person’s socket and the sender’s other device', async () => {
    const { a, b } = await friends();
    const cb = await connect(b);
    const ca1 = await connect(a);
    const ca2 = await connect(a);
    const id = newId();
    const ack = await ca1.request('whisper.send', { handle: b.handle, clientId: id, body: 'live!' });
    expect(ack).toMatchObject({
      op: 'ACK',
      type: 'whisper.send',
      d: { created: true, message: { body: 'live!', seq: 1, mine: true, clientId: id } },
    });

    const got = await cb.next(isMsg);
    expect(got).toMatchObject({
      op: 'EVENT',
      d: { handle: a.handle, message: { body: 'live!', seq: 1, mine: false } },
    });
    const echo = await ca2.next(isMsg);
    expect(echo.d).toMatchObject({ handle: b.handle, message: { body: 'live!', mine: true } });
    expect(JSON.stringify(got)).not.toMatch(/userId|user_id|senderId|@example\.com/);
    expect(await bodies(a.handle, as(b))).toEqual(['live!']);
  });

  it('sending through HTTP reaches an open socket too (the two ways are one system)', async () => {
    const { a, b } = await friends();
    const cb = await connect(b);
    later();
    expect((await whisper(b.handle, 'via http', as(a))).status).toBe(201);
    expect((await cb.next(isMsg)).d).toMatchObject({ handle: a.handle, message: { body: 'via http' } });
  });

  it('a retry with the same client id is acknowledged with the same message and pushed only once', async () => {
    const { a, b } = await friends();
    const cb = await connect(b);
    const ca = await connect(a);
    const id = newId();
    const first = await ca.request('whisper.send', { handle: b.handle, clientId: id, body: 'once' });
    const again = await ca.request('whisper.send', { handle: b.handle, clientId: id, body: 'once' });
    expect(again.d).toMatchObject({
      created: false,
      message: { id: (first.d.message as unknown as { id: string }).id },
    });
    await cb.next(isMsg);
    expect(await cb.never(isMsg)).toBe(true);
  });

  it('frames sent back to back are answered in order and numbered in order', async () => {
    const { a, b } = await friends();
    const ca = await connect(a);
    for (let i = 0; i < 5; i++) {
      ca.sendRaw(
        JSON.stringify({
          v: 1,
          op: 'ACTION',
          type: 'whisper.send',
          requestId: `r${i}`,
          d: { handle: b.handle, clientId: newId(), body: `n${i}` },
        }),
      );
    }
    setRateLimiter(new MemoryRateLimiter(() => Date.now() + (skew += 1e9))); // per-second allowance is not the subject here
    const acks: number[] = [];
    for (let i = 0; i < 5; i++) {
      const f = await ca.next((x) => x.requestId === `r${i}` && (x.op === 'ACK' || x.op === 'ERR'));
      if (f.op === 'ACK') acks.push((f.d.message as unknown as { seq: number }).seq);
    }
    expect(acks).toEqual([...acks].sort((x, y) => x - y));
    expect(acks[0]).toBe(1);
  });

  it('someone else’s socket never receives a thread they are not in', async () => {
    const { a, b } = await friends();
    const c = await person('carol');
    const cc = await connect(c);
    later();
    await whisper(b.handle, 'private', as(a));
    expect(await cc.never(isMsg, 800)).toBe(true);
  });
});

describe('every action is authorised — the same 404 for everything that is not a thread of mine', () => {
  it('strangers, a made-up call sign and a block look identical over the socket', async () => {
    const a = await person('alice');
    const stranger = await person('stranger');
    const villain = await person('villain');
    await doAct(villain.handle, 'block', as(a));
    const c = await connect(a);
    const ask = async (handle: string, type: string, d: object) =>
      (await c.request(type, { handle, ...d })).d;
    const missing = await ask('nobody_here', 'whisper.send', { clientId: newId(), body: 'hi' });
    expect(missing.code).toBe('NOT_FOUND');
    for (const h of [stranger.handle, villain.handle]) {
      expect(await ask(h, 'whisper.send', { clientId: newId(), body: 'hi' }), h).toMatchObject({
        code: missing.code,
        message: missing.message,
      });
      expect(await ask(h, 'whisper.sync', { afterSeq: 0 }), h).toMatchObject({ code: 'NOT_FOUND' });
      expect(await ask(h, 'whisper.read', { upTo: 1 }), h).toMatchObject({ code: 'NOT_FOUND' });
    }
    expect((await q('select count(*)::int n from messages')).rows[0].n).toBe(0);
  });

  it('after a reconnect the client asks for what it missed and gets exactly that, in order', async () => {
    const { a, b } = await friends();
    for (const t of ['one', 'two', 'three']) {
      later();
      await whisper(b.handle, t, as(a));
    }
    const cb = await connect(b);
    const all = await cb.request('whisper.sync', { handle: a.handle, afterSeq: 0 });
    expect((all.d.messages as { body: string }[]).map((m) => m.body)).toEqual(['one', 'two', 'three']);
    const tail = await cb.request('whisper.sync', { handle: a.handle, afterSeq: 2 });
    expect((tail.d.messages as { seq: number }[]).map((m) => m.seq)).toEqual([3]);
    expect((await cb.request('whisper.sync', { handle: a.handle, afterSeq: 3 })).d.messages).toEqual([]);
    expect((await cb.request('whisper.read', { handle: a.handle, upTo: 3 })).d).toMatchObject({
      readUpTo: 3,
    });
  });
});

describe('a live connection cannot outlive the reasons it was allowed', () => {
  it('delivery is re-checked every time: after a block nothing more arrives, even for a message that already exists', async () => {
    const { a, b } = await friends();
    later();
    const sent = await whisper(b.handle, 'before the block', as(a));
    await flushBackground(); // the original hint has been published (to nobody) before Bob connects
    const cb = await connect(b);
    await doAct(a.handle, 'block', as(b)); // bob blocks alice: the Posse and the thread are closed
    const conv = (await q('select id from conversations')).rows[0].id;
    await publishToUser(await userId(b.handle), {
      kind: 'whisper',
      conversationId: conv,
      seq: sent.data.message!.seq,
    });
    expect(await cb.never(isMsg, 800)).toBe(true);
  });

  it('a restricted sender’s words are pushed to the sender’s own devices and never to the recipient', async () => {
    const { a, b } = await friends();
    await doAct(b.handle, 'restrict', as(a)); // alice restricts bob
    const ca = await connect(a);
    const cb1 = await connect(b);
    const cb2 = await connect(b);
    const ack = await cb1.request('whisper.send', {
      handle: a.handle,
      clientId: newId(),
      body: 'held words',
    });
    expect(ack).toMatchObject({ op: 'ACK', d: { message: { body: 'held words', mine: true } } }); // looks sent
    expect((await cb2.next(isMsg)).d).toMatchObject({ message: { body: 'held words' } });
    expect(await ca.never(isMsg, 800)).toBe(true);
  });

  it('ending the session (logout) closes the socket', async () => {
    const a = await person('alice');
    const c = await connect(a);
    await call(authHandlers.logout, 'POST', '/api/auth/logout', {}, as(a));
    expect(await c.waitClosed()).toBe(CLOSE.SESSION_ENDED);
    await expect.poll(() => server.stats().connections).toBe(0);
  });

  it('"log out everywhere" closes every socket of that person and no one else’s', async () => {
    const a = await person('alice');
    const other = await person('other');
    const c1 = await connect(a);
    const co = await connect(other);
    await call(authHandlers.logoutAll, 'POST', '/api/auth/logout-all', {}, as(a));
    expect(await c1.waitClosed()).toBe(CLOSE.SESSION_ENDED);
    expect((await co.request('ping', {})).op).toBe('ACK');
  });

  it('a suspended account is disconnected', async () => {
    const a = await person('alice');
    const c = await connect(a);
    await q("update users set status = 'suspended' where handle = $1", [a.handle]);
    expect(await c.waitClosed()).toBe(CLOSE.SESSION_ENDED);
  });
});

describe('hints carry no words', () => {
  it('a hint that is not exactly a hint is ignored, and nothing about a Whisper travels through Redis', async () => {
    const { a, b } = await friends();
    const cb = await connect(b);
    const redis = (await import('@/platform/redis')).createRedisClient(process.env.REDIS_URL!);
    const uid = await userId(b.handle);
    for (const junk of [
      'nope',
      '{}',
      '{"kind":"whisper"}',
      '{"kind":"whisper","conversationId":"x","seq":1}',
      '{"kind":"other","conversationId":"00000000-0000-4000-8000-000000000000","seq":1}',
    ]) {
      await redis.publish(`rt:user:${uid}`, junk);
    }
    expect(await cb.never(isMsg, 500)).toBe(true);
    // And the real hint for a real message contains ids only.
    const seen: string[] = [];
    const spy = (await import('@/platform/redis')).createRedisClient(process.env.REDIS_URL!);
    spy.on('message', (_c: string, m: string) => seen.push(m));
    await spy.subscribe(`rt:user:${uid}`);
    later();
    await whisper(b.handle, 'secret words here', as(a));
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    expect(seen.join(' ')).not.toMatch(/secret|words|body/);
    redis.disconnect();
    spy.disconnect();
  });
});
