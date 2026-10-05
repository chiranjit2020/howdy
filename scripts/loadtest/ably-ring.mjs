// Staged load test of the Whispers doorbell (ADR-035), against the real Ably app, measuring what ADR-036's revisit
// triggers ask about: how long a ring takes to reach a listener, and whether connections hold as their number grows.
//
//   node scripts/loadtest/ably-ring.mjs                 # 25 → 50 → 100 → 150 listeners, 5 rings each
//   STAGES=10,20 RINGS=3 node scripts/loadtest/ably-ring.mjs
//
// Each listener is its own Ably connection with a token exactly like the app's (subscribe only, one channel, no
// clientId), on a throwaway `lt:` channel that no real person can be on. A ring is the app's ring plus the send time
// (real rings carry nothing). Reads ABLY_API_KEY from .env.local. Stays under the free plan's 200 connections.
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as Ably from 'ably';

const env = readFileSync('.env.local', 'utf8');
const KEY = env.match(/^ABLY_API_KEY="?([^"\r\n]+)"?/m)?.[1];
if (!KEY) throw new Error('ABLY_API_KEY is not in .env.local');
const [KEY_NAME, SECRET] = [KEY.slice(0, KEY.indexOf(':')), KEY.slice(KEY.indexOf(':') + 1)];
const REST = 'https://main.realtime.ably.net';
const AUTH = `Basic ${Buffer.from(KEY).toString('base64')}`;
const STAGES = (process.env.STAGES ?? '25,50,100,150').split(',').map(Number);
const RINGS = Number(process.env.RINGS ?? 5);
const MAX = 150;
if (Math.max(...STAGES) > MAX)
  throw new Error(`at most ${MAX} listeners (free plan: 200 connections in all)`);
const SITE = process.env.SITE ?? 'https://howdy.chiranjitkarmakar.com';
const run = randomBytes(4).toString('hex');
const say = (...parts) => process.stdout.write(`${parts.join(' ')}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The same token request the app signs (platform/live-ping.ts), for one throwaway channel. */
function tokenRequest(channel) {
  const ttl = 10 * 60 * 1000;
  const capability = JSON.stringify({ [channel]: ['subscribe'] });
  const timestamp = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const text = [KEY_NAME, ttl, capability, '', timestamp, nonce].join('\n') + '\n';
  const mac = createHmac('sha256', SECRET).update(text).digest('base64');
  return { keyName: KEY_NAME, ttl, capability, timestamp, nonce, mac };
}

const listeners = [];
const waiting = new Map(); // ringId -> { sentAt, resolve }

async function addListener(i) {
  const channel = `lt:${run}:${i}`;
  const started = performance.now();
  const client = new Ably.Realtime({
    authCallback: (_p, done) => done(null, tokenRequest(channel)),
    closeOnUnload: false,
  });
  const l = { i, channel, client, connectMs: NaN, failed: false, drops: 0 };
  listeners.push(l);
  client.connection.on('disconnected', () => (l.drops += 1));
  client.connection.on('suspended', () => (l.drops += 1));
  try {
    await new Promise((resolve, reject) => {
      client.connection.once('connected', resolve);
      client.connection.once('failed', (c) => reject(c.reason));
      setTimeout(() => reject(new Error('connect timeout')), 20_000);
    });
    l.connectMs = performance.now() - started;
    await client.channels.get(channel).subscribe((msg) => {
      const w = waiting.get(msg.data?.id);
      if (w) {
        waiting.delete(msg.data.id);
        w.resolve(performance.now() - w.sentAt);
      }
    });
  } catch (err) {
    l.failed = true;
    l.error = String(err?.message ?? err);
  }
}

async function ring(l) {
  const id = randomBytes(6).toString('hex');
  const sentAt = performance.now();
  const got = new Promise((resolve) => {
    waiting.set(id, { sentAt, resolve });
    setTimeout(() => {
      if (waiting.delete(id)) resolve(null);
    }, 10_000);
  });
  const res = await fetch(`${REST}/channels/${encodeURIComponent(l.channel)}/messages`, {
    method: 'POST',
    headers: { authorization: AUTH, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'ring', data: { id } }),
    signal: AbortSignal.timeout(5000),
  }).catch((e) => ({ ok: false, status: String(e) }));
  const postMs = performance.now() - sentAt;
  if (!res.ok) {
    waiting.delete(id);
    return { postMs, ms: null, error: res.status };
  }
  return { postMs, ms: await got };
}

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : NaN;
};
const f = (n) => (Number.isFinite(n) ? `${Math.round(n)} ms` : '—');
const mem = () => `${Math.round(process.memoryUsage().rss / 1e6)} MB`;

// One plain round trip to the site from here: roughly what the page's follow-up "what's new?" fetch adds.
const rtts = [];
for (let k = 0; k < 5; k++) {
  const t = performance.now();
  await fetch(`${SITE}/api/whispers/unread`, { headers: { accept: 'application/json' } }).catch(() => {});
  rtts.push(performance.now() - t);
}
say(`run ${run}; site round trip (signed out, 5×): p50 ${f(pct(rtts, 50))}, max ${f(Math.max(...rtts))}`);

const report = [];
try {
  for (const target of STAGES) {
    // Open new connections at ~20 a second (well inside Ably's connection-rate limits).
    while (listeners.length < target) {
      const batch = [];
      for (let k = 0; k < 20 && listeners.length < target; k++) batch.push(addListener(listeners.length));
      await Promise.all(batch);
      await sleep(1000);
    }
    const live = listeners.filter((l) => !l.failed);
    // Ring every live listener RINGS times, ~50 rings a second.
    const results = [];
    for (let r = 0; r < RINGS; r++) {
      for (let k = 0; k < live.length; k += 50) {
        results.push(...(await Promise.all(live.slice(k, k + 50).map(ring))));
        await sleep(1000);
      }
    }
    const ms = results.map((x) => x.ms).filter((x) => x !== null);
    const row = {
      listeners: target,
      connected: live.length,
      failedConnects: listeners.filter((l) => l.failed).length,
      connectP95: pct(
        listeners.filter((l) => !l.failed).map((l) => l.connectMs),
        95,
      ),
      rings: results.length,
      lost: results.filter((x) => x.ms === null).length,
      postErrors: [...new Set(results.filter((x) => x.error).map((x) => x.error))],
      p50: pct(ms, 50),
      p95: pct(ms, 95),
      max: Math.max(...ms),
      postP95: pct(
        results.map((x) => x.postMs),
        95,
      ),
      drops: listeners.reduce((n, l) => n + l.drops, 0),
      rss: mem(),
    };
    report.push(row);
    say(
      `${String(target).padStart(3)} listeners: ${row.connected} connected (${row.failedConnects} failed, connect p95 ${f(row.connectP95)}), ` +
        `${row.rings} rings, ${row.lost} lost, ring→listener p50 ${f(row.p50)} p95 ${f(row.p95)} max ${f(row.max)}; ` +
        `POST p95 ${f(row.postP95)}; drops ${row.drops}; ${row.rss}` +
        (row.postErrors.length ? `; POST errors ${row.postErrors.join(',')}` : ''),
    );
    const errs = [...new Set(listeners.filter((l) => l.failed).map((l) => l.error))];
    if (errs.length) say('   connect errors:', errs.join(' | '));
  }
} finally {
  for (const l of listeners) l.client.close();
  await sleep(1500);
}
say(JSON.stringify({ run, siteRttP50: pct(rtts, 50), stages: report }));
process.exit(0);
