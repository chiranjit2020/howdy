import { requireSession } from '@/modules/auth';
import { removeReply } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Take a reply on a Town Hall post down. Its writer or the Town Hall's owner; anyone else gets a 404. */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await removeReply(user.id, (await params).id ?? '');
  return json({ ok: true });
});
