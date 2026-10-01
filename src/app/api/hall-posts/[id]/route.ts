import { requireSession } from '@/modules/auth';
import { removePost } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/**
 * Take a Town Hall post down. Allowed for its writer and for the Town Hall's owner; anyone else (and anyone naming a post
 * that does not exist) gets the same 404.
 */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await removePost(user.id, (await params).id ?? '');
  return json({ ok: true });
});
