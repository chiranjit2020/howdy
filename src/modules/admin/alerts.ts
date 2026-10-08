import { auditLog, reports, suspensions, users } from '@db/schema';
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { getEnv } from '@/platform/config/env';
import { getDb } from '@/platform/db';
import { logger } from '@/platform/logger';
import { getMailer } from '@/platform/mailer';

/**
 * Security alerts (Control Room). Runs with the health watch (every 30 minutes) and emails the owner and every admin
 * when a rule trips. Each alert is written to `audit_log` as `security_alert`; that row is also the memory that stops
 * the same incident being emailed again for `QUIET_HOURS`. Like the dashboard, it reads only what is already logged —
 * per account and per event type, never per IP (the trail holds none).
 */

export type AlertSeverity = 'critical' | 'high';

export interface SecurityAlert {
  /** Rule id plus subject: what makes two alerts "the same incident". */
  key: string;
  rule: AlertRule;
  severity: AlertSeverity;
  /** The account it is about, when it is about one (null for site-wide waves). */
  userId: string | null;
  handle: string | null;
  count: number;
  summary: string;
}

export type AlertRule =
  | 'account_login_attack'
  | 'second_step_attack'
  | 'login_failure_spike'
  | 'takeover_wave'
  | 'staff_account_change'
  | 'mass_suspensions'
  | 'signup_wave'
  | 'report_flood';

/** Thresholds over the last hour. Tuned for a small network: high enough to stay quiet on a normal day. */
export const ALERT_RULES = {
  /** One account: someone is guessing its password. */
  accountLoginFailures: 10,
  /** One account: wrong second steps mean someone already has the password. */
  accountSecondStepFailures: 3,
  /** Site-wide: credential stuffing across many accounts. */
  siteLoginFailures: 50,
  /** Site-wide: two-step off / passkey or app removed / password reset — accounts being taken over in a wave. */
  siteTakeoverChanges: 5,
  /** One moderator suspending this many people: a compromised or rogue staff account. */
  suspensionsByOneModerator: 10,
  /** Site-wide: a bot wave. */
  signups: 100,
  /** Site-wide: brigading or a raid. */
  reports: 30,
} as const;

const WINDOW_MS = 60 * 60 * 1000;
/** The same incident is not emailed again within this many hours. */
export const QUIET_HOURS = 6;

const TAKEOVER = ['two_step_off', 'passkey_removed', 'app_removed', 'password_reset_completed'] as const;
/** On a staff account, any of these is worth a look on its own. */
const STAFF_SENSITIVE = [...TAKEOVER, 'recovery_code_used', 'recovery_codes_renewed', 'logout_all'] as const;

/** Evaluate every rule against the last hour. Pure read; does not send or record anything. */
export async function findSecurityAlerts(now: Date = new Date()): Promise<SecurityAlert[]> {
  const db = getDb();
  const since = new Date(now.getTime() - WINDOW_MS);
  const R = ALERT_RULES;

  const [perAccount, site, staff, suspenders, signups, reportCount] = await Promise.all([
    db
      .select({
        userId: users.id,
        handle: users.handle,
        login: sql<number>`count(*) filter (where ${auditLog.event} = 'login_failed')::int`,
        second: sql<number>`count(*) filter (where ${auditLog.event} in ('second_step_failed', 'passkey_sign_in_failed'))::int`,
      })
      .from(auditLog)
      .innerJoin(users, eq(users.id, auditLog.userId))
      .where(
        and(
          gte(auditLog.createdAt, since),
          inArray(auditLog.event, ['login_failed', 'second_step_failed', 'passkey_sign_in_failed']),
        ),
      )
      .groupBy(users.id, users.handle),
    db
      .select({
        login: sql<number>`count(*) filter (where ${auditLog.event} = 'login_failed')::int`,
        takeover: sql<number>`count(*) filter (where ${inArray(auditLog.event, [...TAKEOVER])})::int`,
      })
      .from(auditLog)
      .where(gte(auditLog.createdAt, since)),
    db
      .select({ userId: users.id, handle: users.handle, role: users.role, event: auditLog.event })
      .from(auditLog)
      .innerJoin(users, eq(users.id, auditLog.userId))
      .where(
        and(
          gte(auditLog.createdAt, since),
          inArray(users.role, ['moderator', 'admin']),
          inArray(auditLog.event, [...STAFF_SENSITIVE]),
        ),
      ),
    db
      .select({ userId: users.id, handle: users.handle, n: sql<number>`count(*)::int` })
      .from(suspensions)
      .innerJoin(users, eq(users.id, suspensions.createdBy))
      .where(and(gte(suspensions.createdAt, since), isNotNull(suspensions.createdBy)))
      .groupBy(users.id, users.handle),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(and(gte(auditLog.createdAt, since), eq(auditLog.event, 'signup'))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reports)
      .where(gte(reports.createdAt, since)),
  ]);

  const out: SecurityAlert[] = [];
  for (const a of perAccount) {
    if (a.second >= R.accountSecondStepFailures) {
      out.push({
        key: `second_step_attack:${a.userId}`,
        rule: 'second_step_attack',
        severity: 'critical',
        userId: a.userId,
        handle: a.handle,
        count: a.second,
        summary: `${a.second} wrong second steps on @${a.handle} in the last hour — someone may already have the password.`,
      });
    }
    if (a.login >= R.accountLoginFailures) {
      out.push({
        key: `account_login_attack:${a.userId}`,
        rule: 'account_login_attack',
        severity: 'high',
        userId: a.userId,
        handle: a.handle,
        count: a.login,
        summary: `${a.login} failed sign-ins on @${a.handle} in the last hour — someone may be guessing the password.`,
      });
    }
  }
  const s = site[0] ?? { login: 0, takeover: 0 };
  if (s.login >= R.siteLoginFailures) {
    out.push({
      key: 'login_failure_spike',
      rule: 'login_failure_spike',
      severity: 'high',
      userId: null,
      handle: null,
      count: s.login,
      summary: `${s.login} failed sign-ins across Howdy in the last hour — possible credential stuffing.`,
    });
  }
  if (s.takeover >= R.siteTakeoverChanges) {
    out.push({
      key: 'takeover_wave',
      rule: 'takeover_wave',
      severity: 'critical',
      userId: null,
      handle: null,
      count: s.takeover,
      summary: `${s.takeover} two-step removals, passkey/app removals or password resets in the last hour — possible account-takeover wave.`,
    });
  }
  // Staff: one alert per staff account, however many changes it had.
  const staffById = new Map<string, { handle: string; role: string; events: string[] }>();
  for (const r of staff) {
    const e = staffById.get(r.userId) ?? { handle: r.handle, role: r.role, events: [] };
    e.events.push(r.event);
    staffById.set(r.userId, e);
  }
  for (const [uid, e] of staffById) {
    out.push({
      key: `staff_account_change:${uid}`,
      rule: 'staff_account_change',
      severity: 'critical',
      userId: uid,
      handle: e.handle,
      count: e.events.length,
      summary: `Security change on ${e.role} @${e.handle}: ${[...new Set(e.events)].map((x) => x.replace(/_/g, ' ')).join(', ')}. Check it was really them.`,
    });
  }
  for (const m of suspenders) {
    if (m.n >= R.suspensionsByOneModerator) {
      out.push({
        key: `mass_suspensions:${m.userId}`,
        rule: 'mass_suspensions',
        severity: 'critical',
        userId: m.userId,
        handle: m.handle,
        count: m.n,
        summary: `@${m.handle} suspended ${m.n} accounts in the last hour — check the staff account is not compromised.`,
      });
    }
  }
  const signupN = signups[0]?.n ?? 0;
  if (signupN >= R.signups) {
    out.push({
      key: 'signup_wave',
      rule: 'signup_wave',
      severity: 'high',
      userId: null,
      handle: null,
      count: signupN,
      summary: `${signupN} new accounts in the last hour — possible bot wave.`,
    });
  }
  const reportN = reportCount[0]?.n ?? 0;
  if (reportN >= R.reports) {
    out.push({
      key: 'report_flood',
      rule: 'report_flood',
      severity: 'high',
      userId: null,
      handle: null,
      count: reportN,
      summary: `${reportN} reports filed in the last hour — possible brigading or a raid.`,
    });
  }
  // Critical first.
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
}

/** Keys already alerted within the quiet window — read back from the audit trail, so no extra store is needed. */
async function recentlyAlerted(now: Date): Promise<Set<string>> {
  const rows = await getDb()
    .select({ key: sql<string>`${auditLog.meta}->>'key'` })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.event, 'security_alert'),
        gte(auditLog.createdAt, new Date(now.getTime() - QUIET_HOURS * 60 * 60 * 1000)),
      ),
    );
  return new Set(rows.map((r) => r.key));
}

/** The owner (HEALTH_REPORT_TO) and every admin with a confirmed email. */
async function recipients(): Promise<string[]> {
  const admins = await getDb()
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active'), isNotNull(users.emailVerifiedAt)));
  const owner = getEnv().HEALTH_REPORT_TO;
  return [...new Set([...(owner ? [owner] : []), ...admins.map((a) => a.email.toLowerCase())])];
}

export function formatAlertEmail(alerts: SecurityAlert[], now: Date): { subject: string; text: string } {
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const subject =
    `Howdy security ${critical ? 'ALERT' : 'warning'}: ` +
    (alerts.length === 1 ? alerts[0]!.rule.replace(/_/g, ' ') : `${alerts.length} new alerts`);
  const when = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const text = [
    `New security alerts — ${when} IST`,
    '',
    ...alerts.map((a) => `  [${a.severity.toUpperCase()}] ${a.summary}`),
    '',
    `Each alert stays quiet for ${QUIET_HOURS} h after this email.`,
    `Security Center: ${new URL('/admin/security', getEnv().APP_URL).toString()}`,
    'Runbook: docs/security/INCIDENT_RESPONSE.md',
  ].join('\n');
  return { subject, text };
}

export interface AlertRun {
  /** Everything tripping right now. */
  active: SecurityAlert[];
  /** The ones that were new (not alerted within the quiet window) and so were recorded and emailed. */
  fresh: SecurityAlert[];
  emailedTo: number;
  emailError?: string;
}

/**
 * Find what is tripping, record the new ones in the audit trail, and email them in one message. Never throws: an
 * alert run that breaks must not take the health report down with it.
 */
export async function runSecurityAlerts(now: Date = new Date()): Promise<AlertRun> {
  try {
    const active = await findSecurityAlerts(now);
    if (active.length === 0) return { active, fresh: [], emailedTo: 0 };
    const seen = await recentlyAlerted(now);
    const fresh = active.filter((a) => !seen.has(a.key));
    if (fresh.length === 0) return { active, fresh, emailedTo: 0 };

    await getDb()
      .insert(auditLog)
      .values(
        fresh.map((a) => ({
          event: 'security_alert',
          userId: a.userId,
          meta: { key: a.key, rule: a.rule, severity: a.severity, count: a.count },
          createdAt: now,
        })),
      );

    const to = await recipients();
    const { subject, text } = formatAlertEmail(fresh, now);
    let emailedTo = 0;
    const errors: string[] = [];
    for (const addr of to) {
      try {
        await getMailer().send({ to: addr, subject, text });
        emailedTo++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message.slice(0, 200) : 'send failed');
      }
    }
    return { active, fresh, emailedTo, ...(errors.length ? { emailError: errors[0] } : {}) };
  } catch (err) {
    logger.error({ event: 'security_alerts.failed', err });
    return { active: [], fresh: [], emailedTo: 0, emailError: 'The alert run failed; see the logs.' };
  }
}
