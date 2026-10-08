import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminStanding, securityOverview } from '@/modules/admin';
import { getPool } from '@/platform/db';
import { expectAppError, freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { makeRole } from '../helpers/moderation';
import { q, userId } from '../helpers/social';

/** The Security Center (Control Room) is admin-only and read-only. These check the gate and that it reflects the audit trail. */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof settledUser>>;
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const id = (p: P) => userId(p.handle);
/** Put an audit event in the recent past for a user (the trail holds no IPs — none is needed). */
const logEvent = (handle: string, event: string, n = 1) =>
  q(
    `insert into audit_log (user_id, event, created_at)
     select u.id, $2, now() - ($3 || ' minutes')::interval from users u where u.handle = $1`,
    [handle, event, String(n)],
  );

describe('who may open it', () => {
  it('only an admin with two-step: a member, a moderator, and an admin without two-step are all turned away', async () => {
    const [member, mod, bareAdmin, admin] = await Promise.all([
      person('member'),
      person('mod'),
      person('bareadmin'),
      person('admin'),
    ]);
    await makeRole(mod.handle, 'moderator');
    await makeRole(bareAdmin.handle, 'admin', { twoStep: false });
    await makeRole(admin.handle, 'admin');

    expect(await adminStanding(await id(member))).toBe('not_admin');
    expect(await adminStanding(await id(mod))).toBe('not_admin'); // the Security Center is admin-only, not all staff
    expect(await adminStanding(await id(bareAdmin))).toBe('needs_two_step');
    expect(await adminStanding(await id(admin))).toBe('ready');

    // The data function re-checks (zero-trust): anyone not a ready admin gets the plain 404, never data.
    for (const p of [member, mod, bareAdmin]) {
      await expectAppError(await securityOverview(await id(p)).catch((e) => e), 'NOT_FOUND');
    }
    await expect(securityOverview(await id(admin))).resolves.toBeTruthy();
  });
});

describe('what it shows (admin)', () => {
  const ready = async () => {
    const admin = await person('admin');
    await makeRole(admin.handle, 'admin');
    return admin;
  };

  it('flags an account taking repeated sign-in failures in 24h; one below the threshold is not flagged', async () => {
    const admin = await ready();
    const target = await person('target');
    const quiet = await person('quiet');
    for (let i = 0; i < 5; i++) await logEvent(target.handle, 'login_failed', i + 1);
    for (let i = 0; i < 4; i++) await logEvent(quiet.handle, 'login_failed', i + 1);

    const o = await securityOverview(await id(admin));
    const flagged = o.flagged.find((f) => f.handle === target.handle);
    expect(flagged?.loginFailed).toBe(5);
    expect(o.flagged.some((f) => f.handle === quiet.handle)).toBe(false);
  });

  it('24h counts and the recent feed reflect the audit trail', async () => {
    const admin = await ready();
    const u = await person('user');
    await logEvent(u.handle, 'two_step_off', 10);
    await logEvent(u.handle, 'password_reset_completed', 20);

    const o = await securityOverview(await id(admin));
    expect(o.counts.find((c) => c.event === 'two_step_off')?.d1).toBe(1);
    expect(o.recent.some((r) => r.event === 'two_step_off' && r.handle === u.handle)).toBe(true);
    expect(o.sensitive.some((r) => r.event === 'password_reset_completed')).toBe(true);
  });

  it('counts safety: open reports and suspended accounts', async () => {
    const admin = await ready();
    const bad = await person('bad');
    await q(`update users set status = 'suspended' where handle = $1`, [bad.handle]);
    await q(
      `insert into reports (reporter_id, target_user_id, subject, reason, status)
       values ($1, $2, 'person', 'spam', 'open')`,
      [await userId(admin.handle), await userId(bad.handle)],
    );
    const o = await securityOverview(await id(admin));
    expect(o.safety.suspendedAccounts).toBeGreaterThanOrEqual(1);
    expect(o.safety.openReports).toBeGreaterThanOrEqual(1);
  });
});
