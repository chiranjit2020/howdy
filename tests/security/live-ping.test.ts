import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as tokenRoute } from '@/app/api/live/token/route';
import { flushBackground } from '@/platform/background';
import { resetEnvCache } from '@/platform/config/env';
import { getPool } from '@/platform/db';
import { liveChannelFor, liveTokenRequest, ringLive } from '@/platform/live-ping';
import { buildCsp } from '@/proxy';
import { call, freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { doAct, userId } from '../helpers/social';
import { newId, whisper } from '../helpers/whispers';

/** ADR-035: instant Whispers through Ably, as a word-free doorbell on an unguessable, listen-only channel. */

const KEY = 'appId1.keyId2:c2VjcmV0LXBhcnQtZm9yLXRlc3Rz';
let kit: TestKit;
let rings: { url: string; init: RequestInit }[];

beforeEach(async () => {
  kit = await freshAuthState();
  vi.stubEnv('ABLY_API_KEY', KEY);
  resetEnvCache();
  rings = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (!u.startsWith('https://main.realtime.ably.net/')) return realFetch(url, init);
    rings.push({ url: u, init: init ?? {} });
    return new Response('{}', { status: 201 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvCache();
});
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const rungChannels = () =>
  rings.map((r) => decodeURIComponent(r.url.split('/channels/')[1]!.split('/')[0]!)).sort();

describe('channels', () => {
  it('are per person, stable, and say nothing about who', () => {
    const id = '7d3f6a0e-1111-4222-8333-944445555666';
    const ch = liveChannelFor(id)!;
    expect(ch).toBe(liveChannelFor(id));
    expect(ch).not.toBe(liveChannelFor('7d3f6a0e-1111-4222-8333-944445555667'));
    expect(ch).toMatch(/^u:[A-Za-z0-9_-]{32}$/);
    expect(ch).not.toContain(id.slice(0, 8));
  });

  it('do not exist when Ably is not set up (and nothing is rung)', async () => {
    vi.stubEnv('ABLY_API_KEY', undefined);
    resetEnvCache();
    expect(liveChannelFor('x')).toBeUndefined();
    expect(liveTokenRequest('x')).toBeNull();
    await ringLive(['x']);
    expect(rings).toEqual([]);
  });
});

describe('a ring', () => {
  it('carries no words, names or ids, and is sent with the server key', async () => {
    await ringLive(['a', 'a', 'b']);
    expect(rings).toHaveLength(2); // each person once
    for (const r of rings) {
      expect(JSON.parse(String(r.init.body))).toEqual({ name: 'ring' });
      expect((r.init.headers as Record<string, string>).authorization).toBe(
        `Basic ${Buffer.from(KEY).toString('base64')}`,
      );
    }
  });

  it('a failing Ably never fails the caller', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('network down');
    });
    await expect(ringLive(['a'])).resolves.toBeUndefined();
  });
});

describe('the listening token', () => {
  it('is signed with the key and lets the browser only LISTEN to its own channel', () => {
    const t = liveTokenRequest('user-1', 1_700_000_000_000)!;
    expect(t.keyName).toBe('appId1.keyId2');
    expect(JSON.parse(t.capability)).toEqual({ [liveChannelFor('user-1')!]: ['subscribe'] });
    expect(t).not.toHaveProperty('clientId'); // Ably is not told who (and refuses an empty one)
    const text = [t.keyName, t.ttl, t.capability, '', t.timestamp, t.nonce].join('\n') + '\n';
    expect(t.mac).toBe(createHmac('sha256', 'c2VjcmV0LXBhcnQtZm9yLXRlc3Rz').update(text).digest('base64'));
    expect(JSON.stringify(t)).not.toContain('c2VjcmV0'); // the secret itself never leaves
  });

  it('the endpoint needs a session, and answers 404 when Ably is not set up', async () => {
    expect((await call(tokenRoute, 'GET', '/api/live/token')).status).toBe(401);
    const a = await person('alice');
    const r = await call(tokenRoute, 'GET', '/api/live/token', undefined, as(a));
    expect(r.status).toBe(200);
    const capability = JSON.parse((r.data as { capability: string }).capability);
    expect(capability).toEqual({ [liveChannelFor(await userId(a.handle))!]: ['subscribe'] });

    vi.stubEnv('ABLY_API_KEY', undefined);
    resetEnvCache();
    expect((await call(tokenRoute, 'GET', '/api/live/token', undefined, as(a))).status).toBe(404);
  });
});

describe('who is rung when a Whisper is sent', () => {
  async function pals() {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'accept', as(b));
    await flushBackground();
    rings = [];
    return { a, b };
  }

  it('the recipient and the sender (for their other devices)', async () => {
    const { a, b } = await pals();
    expect((await whisper(b.handle, 'howdy', as(a), newId())).status).toBe(201);
    await flushBackground();
    expect(rungChannels()).toEqual(
      [liveChannelFor(await userId(a.handle))!, liveChannelFor(await userId(b.handle))!].sort(),
    );
  });

  it('words held back from the recipient (Restrict) ring only the sender — the recipient hears nothing', async () => {
    const { a, b } = await pals();
    await doAct(b.handle, 'restrict', as(a)); // alice restricts bob
    rings = [];
    expect((await whisper(a.handle, 'held one', as(b), newId())).status).toBe(201);
    await flushBackground();
    expect(rungChannels()).toEqual([liveChannelFor(await userId(b.handle))!]);
  });
});

describe('Content-Security-Policy', () => {
  it("allows Ably's hosts only when Ably is set up", () => {
    expect(buildCsp('n', false)).not.toMatch(/ably/);
    const csp = buildCsp('n', false, undefined, undefined, true);
    expect(csp).toContain('wss://*.ably.net');
    expect(csp).toContain('https://*.ably-realtime.com');
    expect(csp).not.toMatch(/connect-src[^;]*\swss?:(?!\/\/)/); // still no scheme-wide wildcard
  });
});
