import { requireSession } from '@/modules/auth';
import { removeChime, setChimeRead } from '@/modules/notifications';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { chimeReadSchema } from '@/shared/validation/chimes';

export const dynamic = 'force-dynamic';

/** Mark one of my notifications read or unread. Anyone else's, or one that is not there: the same 404. */
export const PATCH = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { read } = await readJson(req, chimeReadSchema);
  await setChimeRead(user.id, (await params).id ?? '', read);
  return json({ ok: true });
});

/** Remove one of my notifications for good. Anyone else's, or one that is not there: the same 404. */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await removeChime(user.id, (await params).id ?? '');
  return json({ ok: true });
});
