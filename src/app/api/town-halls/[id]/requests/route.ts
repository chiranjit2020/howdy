import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { listRequests } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Join requests waiting for an answer. The owner or a Deputy only; everyone else gets the same 404. */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const requests = await listRequests(user.id, (await params).id ?? '');
  await attachPortraits(user.id, requests);
  return json({ requests });
});
