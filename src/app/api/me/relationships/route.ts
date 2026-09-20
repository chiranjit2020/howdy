import { withCards } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { listMyRelationships } from '@/modules/relationships';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** My Posse, requests (in and out), scouting, and the people I have blocked, muted or restricted. Only ever my own. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json(await withCards(await listMyRelationships(user.id)));
});
