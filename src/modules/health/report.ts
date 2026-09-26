import { getEnv } from '@/platform/config/env';
import { getMailer } from '@/platform/mailer';
import { getRedis } from '@/platform/redis';
import {
  checkActivity,
  checkDatabase,
  checkDatabaseSize,
  checkEmail,
  checkMigrations,
  checkRedis,
  checkSite,
  checkStorage,
  readActivity,
  type Activity,
  type CheckResult,
  type CheckStatus,
} from './checks';

export type Overall = 'ok' | 'warn' | 'fail';

export interface HealthReport {
  status: Overall;
  checkedAt: string;
  /** Where this ran (Vercel region) and which commit, so a report can be tied to a deploy. */
  region: string;
  commit: string;
  durationMs: number;
  checks: CheckResult[];
  activity: Activity | null;
}

/** No single check may hold the report up: a hung service is itself the answer. */
const CHECK_TIMEOUT_MS = 8_000;

function withTimeout(id: string, label: string, run: () => Promise<CheckResult>): Promise<CheckResult> {
  return Promise.race([
    run(),
    new Promise<CheckResult>((resolve) =>
      setTimeout(
        () =>
          resolve({ id, label, status: 'fail', detail: `No answer within ${CHECK_TIMEOUT_MS / 1000} s.` }),
        CHECK_TIMEOUT_MS,
      ),
    ),
  ]);
}

const RANK: Record<CheckStatus, number> = { skip: 0, ok: 0, warn: 1, fail: 2 };

export function overallOf(checks: CheckResult[]): Overall {
  const worst = Math.max(0, ...checks.map((c) => RANK[c.status]));
  return worst === 2 ? 'fail' : worst === 1 ? 'warn' : 'ok';
}

/** Run every check at once and put the answers together. Never throws: a check that breaks is reported as failed. */
export async function runHealthReport(opts: { fetchImpl?: typeof fetch } = {}): Promise<HealthReport> {
  const start = performance.now();
  const [database, migrations, size, redis, storage, email, site, activity] = await Promise.all([
    withTimeout('database', 'Database', checkDatabase),
    withTimeout('migrations', 'Database migrations', checkMigrations),
    withTimeout('database_size', 'Database storage', checkDatabaseSize),
    withTimeout('redis', 'Redis (rate limits)', checkRedis),
    withTimeout('storage', 'Photo storage', checkStorage),
    withTimeout('email', 'Email (Resend)', checkEmail),
    withTimeout('site', 'Website', () => checkSite(opts.fetchImpl)),
    readActivity().catch(() => null),
  ]);
  const checks = [database, migrations, size, redis, storage, email, site];
  if (activity) checks.push(...checkActivity(activity));
  return {
    status: overallOf(checks),
    checkedAt: new Date().toISOString(),
    region: process.env.VERCEL_REGION ?? 'local',
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
    durationMs: Math.round(performance.now() - start),
    checks,
    activity,
  };
}

const ICON: Record<CheckStatus, string> = { ok: '[ OK ]', warn: '[WARN]', fail: '[FAIL]', skip: '[ -- ]' };
const HEADLINE: Record<Overall, string> = {
  ok: 'All systems healthy',
  warn: 'Something needs a look',
  fail: 'Something is broken',
};

export type ReportKind = 'digest' | 'alert' | 'recovered';

/** The report as a plain-text email (the mailer sends text only). */
export function formatReport(report: HealthReport, kind: ReportKind): { subject: string; text: string } {
  const when = new Date(report.checkedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const subject =
    kind === 'recovered'
      ? 'Howdy recovered: all systems healthy'
      : kind === 'digest'
        ? `Howdy daily health: ${HEADLINE[report.status].toLowerCase()}`
        : `Howdy ${report.status === 'fail' ? 'ALERT' : 'warning'}: ${HEADLINE[report.status].toLowerCase()}`;

  const needsLook = report.checks.filter((c) => c.status === 'fail' || c.status === 'warn');
  const lines = [
    `${HEADLINE[report.status]} — ${when} IST`,
    '',
    ...(needsLook.length
      ? ['Needs attention:', ...needsLook.map((c) => `  ${ICON[c.status]} ${c.label}: ${c.detail}`), '']
      : []),
    'Every check:',
    ...report.checks.map((c) => `  ${ICON[c.status]} ${c.label}: ${c.detail}`),
    '',
  ];
  if (report.activity) {
    const a = report.activity;
    lines.push(
      'Activity:',
      `  New accounts (24 h): ${a.newAccounts24h}`,
      `  People active (24 h): ${a.activeUsers24h}`,
      `  Failed sign-ins (1 h): ${a.failedLogins1h}`,
      `  Reports waiting: ${a.openReports}`,
      '',
    );
  }
  lines.push(
    `Checked from ${report.region}, commit ${report.commit}, in ${report.durationMs} ms.`,
    `Live report: ${new URL('/api/health/report', getEnv().APP_URL).toString()} (needs the health secret).`,
  );
  return { subject, text: lines.join('\n') };
}

/** Remembered between runs (in Redis) so a lasting problem is emailed now and then, not every half hour. */
interface LastState {
  status: Overall;
  alertedAt: number | null;
}

const STATE_KEY = 'health:last';
/** While something stays wrong, remind at most this often. */
export const REMIND_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Should this run send an email, and which kind? A digest always goes. A watch run emails when things go wrong, when
 * they recover, and as a reminder every few hours while they stay wrong; a healthy run stays quiet.
 */
export function decideEmail(
  mode: 'digest' | 'watch',
  now: Overall,
  last: LastState | null,
  at: number,
): ReportKind | null {
  if (mode === 'digest') return 'digest';
  if (now === 'ok') return last && last.status !== 'ok' ? 'recovered' : null;
  if (!last || last.status === 'ok') return 'alert';
  if (now === 'fail' && last.status === 'warn') return 'alert'; // got worse
  if (!last.alertedAt || at - last.alertedAt >= REMIND_EVERY_MS) return 'alert';
  return null;
}

async function readState(): Promise<LastState | null> {
  try {
    const raw = await getRedis()?.get(STATE_KEY);
    return raw ? (JSON.parse(raw) as LastState) : null;
  } catch {
    return null; // Redis down: treated as "no memory", so a problem is always emailed rather than missed
  }
}

async function writeState(state: LastState): Promise<void> {
  try {
    await getRedis()?.set(STATE_KEY, JSON.stringify(state), 'EX', 7 * 24 * 60 * 60);
  } catch {
    // Best effort.
  }
}

/**
 * Run the checks, email the owner when warranted, and remember the outcome. `emailed` says what (if anything) was sent;
 * `emailError` is set when sending failed (the report itself still comes back).
 */
export async function runAndNotify(
  mode: 'digest' | 'watch',
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ report: HealthReport; emailed: ReportKind | null; emailError?: string }> {
  const report = await runHealthReport(opts);
  const last = await readState();
  const at = Date.now();
  const kind = decideEmail(mode, report.status, last, at);
  const to = getEnv().HEALTH_REPORT_TO;

  let emailed: ReportKind | null = null;
  let emailError: string | undefined;
  if (kind && to) {
    try {
      const { subject, text } = formatReport(report, kind);
      await getMailer().send({ to, subject, text });
      emailed = kind;
    } catch (err) {
      emailError = err instanceof Error ? err.message.slice(0, 200) : 'Could not send the email.';
    }
  }

  const alertedNow = emailed === 'alert';
  await writeState({
    status: report.status,
    alertedAt: report.status === 'ok' ? null : alertedNow ? at : (last?.alertedAt ?? null),
  });
  return { report, emailed, ...(emailError ? { emailError } : {}) };
}
