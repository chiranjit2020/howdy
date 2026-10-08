import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ALERT_RULES, findSecurityAlerts, runSecurityAlerts, securityOverview } from '@/modules/admin';
import { getPool } from '@/platform/db';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { makeRole } from '../helpers/moderation';
import { q, userId } from '../helpers/social';

/**
 * Security alerts (Control Room): each rule trips at its threshold and not below it, a tripped incident is emailed once
 * and then stays quiet, the admins are told, and nothing old (outside the hour) counts.
 */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => settledUser(kit, uniqueUser(tag));
/** `n` audit events for a user, `minsAgo` in the past. */
const logEvents = (handle: string | null, event: string, n: number, minsAgo = 5) =>
  q(
    `insert into audit_log (user_id, event, created_at)
     select (select id from users where handle = $1), $2, now() - ($4 || ' minutes')::interval
     from generate_series(1, $3::int)`,
    [handle, event, n, String(minsAgo)],
  );
const rules = async () => (await findSecurityAlerts()).map((a) => a.rule);

describe('each rule trips at its threshold, not below', () => {
  it('password guessing on one account', async () => {
    const a = await person('acct');
    await logEvents(a.handle, 'login_failed', ALERT_RULES.accountLoginFailures - 1);
    expect(await rules()).not.toContain('account_login_attack');
    await logEvents(a.handle, 'login_failed', 1);
    const found = (await findSecurityAlerts()).find((x) => x.rule === 'account_login_attack');
    expect(found?.handle).toBe(a.handle);
    expect(found?.severity).toBe('high');
  });

  it('wrong second steps are critical (the password is probably known)', async () => {
    const a = await person('acct');
    await logEvents(a.handle, 'second_step_failed', ALERT_RULES.accountSecondStepFailures - 1);
    expect(await rules()).not.toContain('second_step_attack');
    await logEvents(a.handle, 'passkey_sign_in_failed', 1);
    const found = (await findSecurityAlerts()).find((x) => x.rule === 'second_step_attack');
    expect(found?.severity).toBe('critical');
  });

  it('a site-wide sign-in failure spike, spread over many accounts', async () => {
    const people = await Promise.all([person('s1'), person('s2'), person('s3'), person('s4'), person('s5')]);
    // 9 each: no single account trips, but together they pass the site-wide line.
    for (const p of people) await logEvents(p.handle, 'login_failed', 9);
    await logEvents(null, 'login_failed', ALERT_RULES.siteLoginFailures - 45 - 1);
    expect(await rules()).not.toContain('login_failure_spike');
    await logEvents(null, 'login_failed', 1);
    const r = await rules();
    expect(r).toContain('login_failure_spike');
    expect(r).not.toContain('account_login_attack');
  });

  it('an account-takeover wave', async () => {
    const a = await person('acct');
    await logEvents(a.handle, 'two_step_off', 2);
    await logEvents(a.handle, 'passkey_removed', 1);
    await logEvents(a.handle, 'password_reset_completed', ALERT_RULES.siteTakeoverChanges - 4);
    expect(await rules()).not.toContain('takeover_wave');
    await logEvents(a.handle, 'app_removed', 1);
    expect(await rules()).toContain('takeover_wave');
  });

  it('any security change on a staff account, but not on a member', async () => {
    const [member, mod] = await Promise.all([person('member'), person('mod')]);
    await makeRole(mod.handle, 'moderator');
    await logEvents(member.handle, 'two_step_off', 1);
    expect(await rules()).not.toContain('staff_account_change');
    await logEvents(mod.handle, 'recovery_code_used', 1);
    const found = (await findSecurityAlerts()).filter((x) => x.rule === 'staff_account_change');
    expect(found.map((x) => x.handle)).toEqual([mod.handle]);
    expect(found[0]?.severity).toBe('critical');
  });

  it('a sign-up wave and a report flood', async () => {
    await logEvents(null, 'signup', ALERT_RULES.signups - 1);
    expect(await rules()).not.toContain('signup_wave');
    await logEvents(null, 'signup', 1);
    expect(await rules()).toContain('signup_wave');

    const [r, t] = await Promise.all([person('reporter'), person('target')]);
    await q(
      `insert into reports (reporter_id, target_user_id, subject, reason, status)
       select $1, $2, 'person', 'spam', 'dismissed' from generate_series(1, $3::int)`,
      [await userId(r.handle), await userId(t.handle), ALERT_RULES.reports],
    );
    expect(await rules()).toContain('report_flood');
  });

  it('one moderator suspending many accounts', async () => {
    const mod = await person('mod');
    await makeRole(mod.handle, 'moderator');
    const modId = await userId(mod.handle);
    // Bare rows for the suspended accounts: signing up this many would trip the sign-up rate limit.
    await q(
      `with v as (
         insert into users (email, handle, status)
         select 'victim' || i || '@example.test', 'victim_' || i, 'suspended' from generate_series(1, $1::int) i
         returning id)
       insert into suspensions (user_id, reason, created_by) select id, 'spam', $2 from v`,
      [ALERT_RULES.suspensionsByOneModerator, modId],
    );
    const found = (await findSecurityAlerts()).find((x) => x.rule === 'mass_suspensions');
    expect(found?.handle).toBe(mod.handle);
  });

  it('events older than an hour do not count', async () => {
    const a = await person('acct');
    await logEvents(a.handle, 'login_failed', ALERT_RULES.accountLoginFailures + 5, 61);
    expect(await findSecurityAlerts()).toEqual([]);
  });
});

describe('sending', () => {
  it('emails admins once per incident, records it, and stays quiet on the next run', async () => {
    const [admin, a] = await Promise.all([person('admin'), person('acct')]);
    await makeRole(admin.handle, 'admin');
    await logEvents(a.handle, 'login_failed', ALERT_RULES.accountLoginFailures);

    const first = await runSecurityAlerts();
    expect(first.fresh.map((x) => x.rule)).toEqual(['account_login_attack']);
    expect(first.emailedTo).toBeGreaterThanOrEqual(1);
    const mail = kit.mailer.lastTo(admin.email.toLowerCase());
    expect(mail?.subject).toMatch(/security warning/i);
    expect(mail?.text).toContain(a.handle);
    expect(mail?.text).toContain('/admin/security');
    // Never a password, token or IP in the mail — only handles and counts.
    expect(mail?.text).not.toMatch(/password:|token|\b\d{1,3}(\.\d{1,3}){3}\b/i);

    const sent = kit.mailer.sent.length;
    const second = await runSecurityAlerts();
    expect(second.active).toHaveLength(1); // still tripping...
    expect(second.fresh).toEqual([]); // ...but already told
    expect(kit.mailer.sent.length).toBe(sent);

    // The dashboard lists it.
    const o = await securityOverview(await userId(admin.handle));
    expect(o.alerts.map((x) => x.rule)).toEqual(['account_login_attack']);
  });

  it('a new incident on another account is still sent while the first is quiet', async () => {
    const [admin, a, b] = await Promise.all([person('admin'), person('acct'), person('bcct')]);
    await makeRole(admin.handle, 'admin');
    await logEvents(a.handle, 'login_failed', ALERT_RULES.accountLoginFailures);
    await runSecurityAlerts();
    await logEvents(b.handle, 'login_failed', ALERT_RULES.accountLoginFailures);
    const run = await runSecurityAlerts();
    expect(run.fresh.map((x) => x.handle)).toEqual([b.handle]);
  });

  it('nothing tripping: no email, nothing recorded', async () => {
    const admin = await person('admin');
    await makeRole(admin.handle, 'admin');
    const run = await runSecurityAlerts();
    expect(run).toMatchObject({ active: [], fresh: [], emailedTo: 0 });
    expect(kit.mailer.sent.filter((m) => /security/i.test(m.subject))).toEqual([]);
  });
});
