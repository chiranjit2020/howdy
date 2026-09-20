import { requireSession } from '@/modules/auth';
import { unreadCount } from '@/modules/notifications';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** How many unread Chimes I can see (capped at 99). Counted with the same filter as the list, so the two always agree. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ unread: await unreadCount(user.id) });
});
