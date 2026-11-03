import { requireSession } from '@/modules/auth';
import { pinCard, unpinCard } from '@/modules/fence';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/**
 * Pin this card to the top of your own wall (POST), replacing the one before, or unpin it (DELETE). The wall's owner and
 * a published card only; anyone else, and any card they may not pin, gets the same 404.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await pinCard(user.id, (await params).id ?? '');
  return json({ ok: true });
});

export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await unpinCard(user.id, (await params).id ?? '');
  return json({ ok: true });
});
