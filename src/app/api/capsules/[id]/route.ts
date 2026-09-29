import { requireSession } from '@/modules/auth';
import { removeCapsule } from '@/modules/capsules';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Take back a capsule I sealed (before it opens), or delete one that opened for me. Anything else is a 404. */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await removeCapsule(user.id, (await params).id ?? '');
  return json({ ok: true });
});
