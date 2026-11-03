import { requireSession } from '@/modules/auth';
import { markSeen } from '@/modules/notifications';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { markSeenSchema } from '@/shared/validation/chimes';

export const dynamic = 'force-dynamic';

/**
 * Opening my notifications: the bell's number clears up to `before` (what the page showed). Each one stays unread until
 * it is opened or marked. Only ever mine: there is no id to change.
 */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const { before } = await readJson(req, markSeenSchema);
  await markSeen(user.id, before);
  return json({ ok: true });
});
