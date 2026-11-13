import { requireSession } from '@/modules/auth';
import { unreadCount } from '@/modules/notifications';
import { BUY_OR_WAIT_ANNOUNCEMENT, isTeamMember, previewAnnouncement } from '@/modules/push';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';
import { enforceRateLimit } from '@/platform/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Send the scheduled announcement to my own devices only, to check it before it goes out. The Howdy team (admins) only;
 * anyone else gets the same 404 as a page that is not there. A few a minute at most.
 */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  if (!(await isTeamMember(user.id))) throw new AppError('NOT_FOUND');
  await enforceRateLimit(`announce:preview:${user.id}`, { limit: 5, windowSec: 600 });
  const devices = await previewAnnouncement(BUY_OR_WAIT_ANNOUNCEMENT, user.id, await unreadCount(user.id));
  return json({ devices });
});
