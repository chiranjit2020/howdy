import { requireSession } from '@/modules/auth';
import { markRead } from '@/modules/notifications';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { markReadSchema } from '@/shared/validation/chimes';

export const dynamic = 'force-dynamic';

/** Mark my Chimes read: `{ all: true }` or `{ ids: [...] }`. Only ever my own; anyone else's ids do nothing. */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const target = await readJson(req, markReadSchema);
  return json(await markRead(user.id, target));
});
