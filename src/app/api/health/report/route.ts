import { timingSafeEqual } from 'node:crypto';
import { runAndNotify } from '@/modules/health';
import { getEnv } from '@/platform/config/env';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';
// Every check has its own 8 s limit and they run side by side, so a full report fits well inside this.
export const maxDuration = 30;

function authorised(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The full health report, for schedulers only: Vercel Cron (daily digest, `?mode=digest`) and the GitHub Actions
 * watcher (every 30 minutes, `?mode=watch`, which only emails when something goes wrong or recovers). Needs
 * "Authorization: Bearer <CRON_SECRET>"; without the secret configured the route does not exist.
 *
 * Answers 200 when everything is fine or only warnings, 503 when something has failed, so the watcher itself fails
 * (and GitHub emails the owner) even if this app could not send its own email.
 */
export const GET = route(async ({ req, log }) => {
  const secret = getEnv().CRON_SECRET;
  if (!secret) throw new AppError('NOT_FOUND');
  if (!authorised(req.headers.get('authorization'), secret)) throw new AppError('UNAUTHENTICATED');

  const mode = new URL(req.url).searchParams.get('mode') === 'digest' ? 'digest' : 'watch';
  const { report, emailed, emailError } = await runAndNotify(mode);
  log.info({
    event: 'health.report',
    mode,
    status: report.status,
    failing: report.checks.filter((c) => c.status === 'fail').map((c) => c.id),
    warning: report.checks.filter((c) => c.status === 'warn').map((c) => c.id),
    emailed,
    emailError,
  });
  return json(
    { ...report, emailed, ...(emailError ? { emailError } : {}) },
    { status: report.status === 'fail' ? 503 : 200 },
  );
});
