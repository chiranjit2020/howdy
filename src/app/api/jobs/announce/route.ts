import { BUY_OR_WAIT_ANNOUNCEMENT, sendAnnouncement } from '@/modules/push';
import { unreadCount } from '@/modules/notifications';
import { hiddenAuthors } from '@/modules/relationships';
import { getEnv } from '@/platform/config/env';
import { AppError } from '@/platform/errors';
import { cronAuthorised } from '@/platform/http/cron';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The scheduled one-off team announcement (2026-11-14: "Buy or wait?", Sat 15 Nov 7:30 pm IST), for Vercel Cron only:
 * "Authorization: Bearer <CRON_SECRET>". It sends at most once, inside its window; any other run says why it skipped.
 */
export const GET = route(async ({ req, log }) => {
  const secret = getEnv().CRON_SECRET;
  if (!secret) throw new AppError('NOT_FOUND');
  if (!cronAuthorised(req.headers.get('authorization'), secret)) throw new AppError('UNAUTHENTICATED');
  const result = await sendAnnouncement(BUY_OR_WAIT_ANNOUNCEMENT, {
    hidesTeam: async (userId, team) => (await hiddenAuthors(userId, team)).size > 0,
    badgeFor: (userId) => unreadCount(userId),
  });
  log.info({ event: 'jobs.announce', ...result });
  return json(result);
});
