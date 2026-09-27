import { runAllPurges } from '@/app/_lib/purge';
import { getEnv } from '@/platform/config/env';
import { AppError } from '@/platform/errors';
import { cronAuthorised } from '@/platform/http/cron';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The daily retention run, for Vercel Cron only: deletes what has outlived the periods the Privacy Policy promises
 * (Whispers and Tracks after 7 days, old Chimes, expired sessions and links, stale uploads…). Needs
 * "Authorization: Bearer <CRON_SECRET>"; without the secret configured the route does not exist.
 */
export const GET = route(async ({ req, log }) => {
  const secret = getEnv().CRON_SECRET;
  if (!secret) throw new AppError('NOT_FOUND');
  if (!cronAuthorised(req.headers.get('authorization'), secret)) throw new AppError('UNAUTHENTICATED');
  const started = Date.now();
  const summary = await runAllPurges();
  log.info({ event: 'jobs.purge', ...summary, durationMs: Date.now() - started });
  return json({ ok: true, ...summary });
});
