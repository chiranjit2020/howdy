import { requireSession } from '@/modules/auth';
import { listTracks } from '@/modules/tracks';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/**
 * Who stopped by my Ranch in the last week. Only ever MY incoming Tracks — there is no way to ask where anyone has been. People in
 * my Posse are named; everyone else is only counted. Times are Today / Yesterday / This week. Frozen while I am on Shadow Walk.
 */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json(await listTracks(user.id));
});
