import { requireSession } from '@/modules/auth';
import { listWaitingTributes } from '@/modules/tributes';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Tributes waiting for my approval on my own Ranch. The owner is always the signed-in user; there is no id to change. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ waiting: await listWaitingTributes(user.id) });
});
