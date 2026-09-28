import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as subscribeRoute, DELETE as unsubscribeRoute } from '@/app/api/push/route';
import { authHandlers } from '@/modules/auth';
import { MAX_DEVICES, purgeDeadSubscriptions, setPushSender, type PushTarget } from '@/modules/push';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import type { PushPayload } from '@/shared/validation/push';
import { call, freshAuthState, loginAs, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { patchPrefs } from '../helpers/chimes';
import { doAct, q } from '../helpers/social';
import { whisper } from '../helpers/whispers';

let kit: TestKit;
let sent: { target: PushTarget; payload: PushPayload }[] = [];
let answer = 201;
/** A clock the limiter reads, so sending several Whispers does not wait out the per-second allowance. */
let skew = 0;
beforeEach(async () => {
  kit = await freshAuthState();
  skew = 0;
  setRateLimiter(new MemoryRateLimiter(() => Date.now() + skew));
  sent = [];
  answer = 201;
  setPushSender(async (target, payload) => {
    sent.push({ target, payload: JSON.parse(payload) as PushPayload });
    return answer;
  });
});
afterEach(() => setPushSender(null));
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
type P = Awaited<ReturnType<typeof person>>;
const as = (p: { cookie: string }) => ({ cookie: p.cookie });

let n = 0;
const device = (host = 'fcm.googleapis.com') => ({
  endpoint: `https://${host}/fcm/send/device-${++n}-${Date.now()}`,
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
});
const sub = (body: unknown, opts: { cookie?: string; origin?: string | null } = {}) =>
  call(subscribeRoute, 'POST', '/api/push', body, opts);
const unsub = (body: unknown, opts: { cookie?: string } = {}) =>
  call(unsubscribeRoute, 'DELETE', '/api/push', body, opts);
const count = async () => (await q('select count(*)::int n from push_subscriptions')).rows[0].n as number;

async function pals() {
  const a = await person('alice');
  const b = await person('bob');
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
  await flushBackground();
  sent = [];
  return { a, b };
}
async function say(from: P, to: P, body: string) {
  skew += 4000;
  expect((await whisper(to.handle, body, as(from))).status).toBeLessThan(300);
  await flushBackground();
}
const to = (d: { endpoint: string }) => sent.filter((s) => s.target.endpoint === d.endpoint);

describe('subscribing a device', () => {
  it('needs a session and a same-origin request', async () => {
    const a = await person('ann');
    expect((await sub(device())).status).toBe(401);
    expect((await sub(device(), { ...as(a), origin: 'https://evil.example' })).status).toBe(403);
    expect((await sub(device(), as(a))).status).toBe(200);
    expect(await count()).toBe(1);
  });

  it('only real push services: anything else (SSRF bait) is refused before it is stored', async () => {
    const a = await person('ann');
    const bad = [
      'http://fcm.googleapis.com/fcm/send/x', // not https
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://169.254.169.254/latest/meta-data',
      'https://evil.example/x',
      'https://fcm.googleapis.com.evil.example/x', // look-alike
      'https://user:pw@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://' + 'a'.repeat(1030),
      'not a url',
    ];
    for (const endpoint of bad) {
      const r = await sub({ endpoint, keys: device().keys }, as(a));
      expect(r.status, endpoint).toBe(422);
    }
    for (const host of [
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'web.push.apple.com',
      'wns2-by3p.notify.windows.com',
    ]) {
      expect((await sub(device(host), as(a))).status, host).toBe(200);
    }
    expect((await sub({ ...device(), keys: { p256dh: 'x', auth: 'y' } }, as(a))).status).toBe(422);
  });

  it('keeps at most MAX_DEVICES per person (the oldest goes)', async () => {
    const a = await person('ann');
    const first = device();
    await sub(first, as(a));
    for (let i = 0; i < MAX_DEVICES; i++) await sub(device(), as(a));
    expect(await count()).toBe(MAX_DEVICES);
    expect((await q('select 1 from push_subscriptions where endpoint = $1', [first.endpoint])).rowCount).toBe(
      0,
    );
  });

  it('unsubscribing only ever removes my own device (someone else’s endpoint is a quiet no-op)', async () => {
    const a = await person('ann');
    const b = await person('bea');
    const d = device();
    await sub(d, as(a));
    expect((await unsub({ endpoint: d.endpoint }, as(b))).status).toBe(200);
    expect(await count()).toBe(1);
    expect((await unsub({ endpoint: d.endpoint }, as(a))).status).toBe(200);
    expect(await count()).toBe(0);
  });
});

describe('what gets pushed', () => {
  it('a Whisper pushes the Chime line to the recipient — never the words — and nothing to the sender', async () => {
    const { a, b } = await pals();
    const bd = device();
    const ad = device();
    await sub(bd, as(b));
    await sub(ad, as(a));
    await say(a, b, 'the secret plan is at dawn');
    expect(to(ad)).toHaveLength(0);
    expect(to(bd)).toHaveLength(1);
    const p = to(bd)[0]!.payload;
    expect(p).toMatchObject({ title: 'Howdy', url: `/whispers/${a.handle}`, tag: `whisper:${a.handle}` });
    expect(p.body).toMatch(/whispered to you\.$/);
    expect(JSON.stringify(p)).not.toContain('secret plan');
    expect(JSON.stringify(p)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no ids of people
    expect(p.badge).toBeGreaterThanOrEqual(1);
  });

  it('pushes nothing that the bell would not ring: a restricted sender, a muted person, a switched-off kind', async () => {
    const { a, b } = await pals();
    const bd = device();
    await sub(bd, as(b));
    await doAct(a.handle, 'restrict', as(b));
    await say(a, b, 'held');
    expect(to(bd)).toHaveLength(0);
    await doAct(a.handle, 'unrestrict', as(b));
    await doAct(a.handle, 'mute', as(b));
    await say(a, b, 'muted');
    expect(to(bd)).toHaveLength(0);
    await doAct(a.handle, 'unmute', as(b));
    expect((await patchPrefs({ whispers: false }, as(b))).status).toBe(200);
    await say(a, b, 'switched off');
    expect(to(bd)).toHaveLength(0);
    await patchPrefs({ whispers: true }, as(b));
    await say(a, b, 'now it rings');
    expect(to(bd)).toHaveLength(1);
  });

  it('a signed-out device gets nothing; signing in again on it (a fresh subscribe) brings it back', async () => {
    const { a, b } = await pals();
    const bd = device();
    await sub(bd, as(b));
    await call(authHandlers.logout, 'POST', '/api/auth/logout', {}, as(b));
    await say(a, b, 'after logout');
    expect(to(bd)).toHaveLength(0);
    const again = await loginAs(b);
    await sub(bd, { cookie: again.cookie! });
    await say(a, b, 'after login');
    expect(to(bd)).toHaveLength(1);
  });

  it('a phone handed to another account stops reaching the first one', async () => {
    const { a, b } = await pals();
    const c = await person('carol');
    const shared = device();
    await sub(shared, as(b));
    await sub(shared, as(c)); // carol signs in on the same browser
    await say(a, b, 'for bob');
    expect(to(shared)).toHaveLength(0);
    expect(await count()).toBe(1);
  });

  it('a device the push service says is gone (410) is forgotten; dead sessions are purged', async () => {
    const { a, b } = await pals();
    await sub(device(), as(b));
    answer = 410;
    await say(a, b, 'hello?');
    expect(await count()).toBe(0);

    answer = 201;
    await sub(device(), as(b));
    await call(authHandlers.logout, 'POST', '/api/auth/logout', {}, as(b));
    expect((await purgeDeadSubscriptions()).devices).toBe(1);
    expect(await count()).toBe(0);
  });
});
