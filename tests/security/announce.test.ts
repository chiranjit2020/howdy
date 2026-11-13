import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as subscribeRoute } from '@/app/api/push/route';
import { GET as announceRoute } from '@/app/api/jobs/announce/route';
import { POST as previewRoute } from '@/app/api/admin/announce-preview/route';
import {
  BUY_OR_WAIT_ANNOUNCEMENT,
  setPushSender,
  sendAnnouncement,
  type Announcement,
  type PushTarget,
} from '@/modules/push';
import { hiddenAuthors } from '@/modules/relationships';
import { getPool } from '@/platform/db';
import type { PushPayload } from '@/shared/validation/push';
import { call, freshAuthState, request, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { doAct, q } from '../helpers/social';

/**
 * The one-off team announcement (2026-11-14): once, inside its window, to people with notifications on, never to anyone
 * who has hidden the team (or been hidden by it).
 */

let kit: TestKit;
let sent: { target: PushTarget; payload: PushPayload }[] = [];
beforeEach(async () => {
  kit = await freshAuthState();
  sent = [];
  setPushSender(async (target, payload) => {
    sent.push({ target, payload: JSON.parse(payload) as PushPayload });
    return 201;
  });
});
afterEach(() => setPushSender(null));
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
let n = 0;
const device = () => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/announce-${++n}-${Date.now()}`,
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
});
const subscribe = (p: { cookie: string }) => call(subscribeRoute, 'POST', '/api/push', device(), as(p));

const at = new Date('2026-11-15T14:05:00Z');
const make = (): Announcement => ({
  id: `test-${Date.now()}-${++n}`,
  notBefore: new Date('2026-11-15T14:00:00Z'),
  notAfter: new Date('2026-11-16T02:00:00Z'),
  payload: { title: 'Howdy', body: 'New: Buy or wait?', url: '/buy-or-wait', tag: 'announce:test' },
});
const hooks = {
  hidesTeam: async (userId: string, team: string[]) => (await hiddenAuthors(userId, team)).size > 0,
  badgeFor: async () => 0,
};

describe('the announcement', () => {
  it('goes once, in its window, to every device with notifications on; never early, late or twice', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    await person('nopush'); // no device: nothing to send
    expect((await subscribe(ann)).status).toBe(200);
    expect((await subscribe(bob)).status).toBe(200);
    const a = make();

    expect(await sendAnnouncement(a, hooks, new Date('2026-11-15T13:59:00Z'))).toEqual({
      status: 'skipped',
      reason: 'too_early',
    });
    expect(await sendAnnouncement(a, hooks, at)).toEqual({ status: 'sent', people: 2, devices: 2 });
    expect(sent.map((s) => s.payload)).toEqual([
      expect.objectContaining({ body: 'New: Buy or wait?', url: '/buy-or-wait', badge: 0 }),
      expect.objectContaining({ body: 'New: Buy or wait?', url: '/buy-or-wait', badge: 0 }),
    ]);
    sent = [];
    expect(await sendAnnouncement(a, hooks, at)).toEqual({ status: 'skipped', reason: 'already_sent' });
    expect(sent).toEqual([]);
    expect(await sendAnnouncement(make(), hooks, new Date('2026-11-16T03:00:00Z'))).toEqual({
      status: 'skipped',
      reason: 'too_late',
    });
  });

  it('skips anyone who muted the team, or whom the team blocked (the team itself cannot be blocked)', async () => {
    const team = await person('team');
    await q("update users set role = 'admin' where handle = $1", [team.handle]);
    const keeps = await person('keeps');
    const mutes = await person('mutes');
    const blocked = await person('blocked');
    for (const p of [keeps, mutes, blocked]) expect((await subscribe(p)).status).toBe(200);
    await doAct(team.handle, 'mute', as(mutes));
    await doAct(blocked.handle, 'block', as(team));
    expect(await sendAnnouncement(make(), hooks, at)).toMatchObject({ status: 'sent', people: 1 });
    expect(sent).toHaveLength(1);
  });

  it('a team member can preview it on their own devices only; it does not use up the real send', async () => {
    const team = await person('team');
    const other = await person('other');
    expect((await subscribe(team)).status).toBe(200);
    expect((await subscribe(other)).status).toBe(200);
    // Not on the team: the same 404 as a missing page, and nothing sent.
    expect((await call(previewRoute, 'POST', '/api/admin/announce-preview', {}, as(other))).status).toBe(404);
    expect(sent).toEqual([]);
    await q("update users set role = 'admin' where handle = $1", [team.handle]);
    const res = await call(previewRoute, 'POST', '/api/admin/announce-preview', {}, as(team));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({ url: '/buy-or-wait' });
    expect(sent[0]!.payload.body).toMatch(/^New: Buy or wait\?/);
    // The real announcement still goes out afterwards.
    sent = [];
    const real = { ...make(), payload: BUY_OR_WAIT_ANNOUNCEMENT.payload };
    expect(await sendAnnouncement(real, hooks, at)).toMatchObject({ status: 'sent', people: 2 });
  });

  it('the job needs the cron secret', async () => {
    const res = await announceRoute(request('GET', '/api/jobs/announce'));
    expect([401, 404]).toContain(res.status);
  });
});
