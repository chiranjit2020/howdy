import { requireSession } from '@/modules/auth';
import { removeReply } from '@/modules/fence';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Take a reply down: its writer or the owner of the Fence it is on. Anyone else gets the same 404 as for a missing reply. */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await removeReply(user.id, (await params).id ?? '');
  return json({ ok: true });
});
