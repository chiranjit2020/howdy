import { requireSession } from '@/modules/auth';
import { listWaiting } from '@/modules/fence';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** What is waiting for my approval on my own Fence. The owner is always the signed-in user; there is no id to change. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json(await listWaiting(user.id));
});
