import { requireSession } from '@/modules/auth';
import { unreadThreads } from '@/modules/whispers';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** How many threads have something new for me (muted people and closed threads excluded), capped at 99. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ unread: await unreadThreads(user.id) });
});
