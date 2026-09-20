import { requireSession } from '@/modules/auth';
import { listThreads } from '@/modules/whispers';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** My Whisper threads, newest first — only those still open (in each other's Posse, no block). The person is always me. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ threads: await listThreads(user.id) });
});
