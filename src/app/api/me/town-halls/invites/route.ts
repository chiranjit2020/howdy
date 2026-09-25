import { requireSession } from '@/modules/auth';
import { listMyInvites } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Town Halls that invited me and are still waiting for my answer. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ invites: await listMyInvites(user.id) });
});
