import { requireSession } from '@/modules/auth';
import { removeCard } from '@/modules/fence';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/**
 * Take a card down. Allowed for its writer and for the owner of the Fence it is on; anyone else (and anyone naming a card
 * that does not exist) gets the same 404.
 */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await removeCard(user.id, (await params).id ?? '');
  return json({ ok: true });
});
