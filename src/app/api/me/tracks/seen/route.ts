import { requireSession } from '@/modules/auth';
import { markVisitsSeen } from '@/modules/tracks';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** I have opened my visitors: clear their "new" mark. Only ever my own; there is nothing to name. */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  await markVisitsSeen(user.id);
  return json({ ok: true });
});
