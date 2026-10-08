import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { RANGES, consoleData, isConsoleRange } from '@/modules/admin';
import { getPool } from '@/platform/db';
import { expectAppError, freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { makeRole } from '../helpers/moderation';
import { q, userId } from '../helpers/social';

/** The Mission Console: admin-only, and every number is a real count over the chosen window. */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const logEvents = (handle: string, event: string, n: number, minsAgo: number) =>
  q(
    `insert into audit_log (user_id, event, created_at)
     select (select id from users where handle = $1), $2, now() - ($4 || ' minutes')::interval
     from generate_series(1, $3::int)`,
    [handle, event, n, String(minsAgo)],
  );
const readyAdmin = async () => {
  const admin = await person('admin');
  await makeRole(admin.handle, 'admin');
  return userId(admin.handle);
};

describe('the gate', () => {
  it('a member and a moderator get the plain 404, never data', async () => {
    const [member, mod] = await Promise.all([person('member'), person('mod')]);
    await makeRole(mod.handle, 'moderator');
    for (const p of [member, mod]) {
      await expectAppError(await consoleData(await userId(p.handle)).catch((e) => e), 'NOT_FOUND');
    }
  });

  it('only known ranges are accepted', () => {
    expect(['1h', '6h', '24h', '7d'].every(isConsoleRange)).toBe(true);
    for (const bad of ['30d', '', '__proto__', 'constructor', undefined, ['7d']])
      expect(isConsoleRange(bad)).toBe(false);
  });
});

describe('what it counts', () => {
  it('the series has one bucket per step, and only events inside the window land in it', async () => {
    const adminId = await readyAdmin();
    const u = await person('user');
    await logEvents(u.handle, 'login_failed', 3, 30); // inside 1h
    await logEvents(u.handle, 'login_failed', 2, 90); // outside 1h, inside 6h

    const hour = await consoleData(adminId, '1h');
    expect(hour.series).toHaveLength(RANGES['1h'].buckets);
    expect(hour.series.reduce((n, b) => n + b.failed, 0)).toBe(3);

    const six = await consoleData(adminId, '6h');
    expect(six.series).toHaveLength(RANGES['6h'].buckets);
    expect(six.series.reduce((n, b) => n + b.failed, 0)).toBe(5);
  });

  it('KPIs compare this period with the one before it', async () => {
    const adminId = await readyAdmin();
    const u = await person('user');
    await logEvents(u.handle, 'login_failed', 4, 30); // this hour
    await logEvents(u.handle, 'login_failed', 2, 90); // the hour before
    await logEvents(u.handle, 'login_failed', 7, 200); // older: neither

    const d = await consoleData(adminId, '1h');
    expect(d.kpis.loginFails).toEqual({ now: 4, prev: 2 });
  });

  it('counts real social activity and the report queue', async () => {
    const adminId = await readyAdmin();
    const [a, b] = await Promise.all([person('acct'), person('bcct')]);
    const [aId, bId] = await Promise.all([userId(a.handle), userId(b.handle)]);
    // A Post Card on b's Fence from a, and a Yo on it from b.
    await q(
      `with c as (insert into post_cards (fence_owner_id, author_id, body) values ($2, $1, 'howdy') returning id)
       insert into yos (card_id, user_id) select id, $2 from c`,
      [aId, bId],
    );
    await q(
      `insert into reports (reporter_id, target_user_id, subject, reason, status) values ($1, $2, 'person', 'spam', 'open')`,
      [aId, bId],
    );

    const d = await consoleData(adminId, '24h');
    expect(d.social.postCards.now).toBe(1);
    expect(d.social.yos.now).toBe(1);
    expect(d.queue.open).toBe(1);
    expect(d.queue.oldest).toHaveLength(1);
    expect(d.queue.oldest[0]?.reason).toBe('spam');
    expect(d.series.reduce((n, x) => n + x.reports, 0)).toBe(1);
    expect(d.kpis.totalUsers).toBeGreaterThanOrEqual(3);
  });
});
