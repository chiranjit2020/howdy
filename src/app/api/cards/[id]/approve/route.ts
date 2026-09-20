import { requireSession } from '@/modules/auth';
import { approveCard } from '@/modules/fence';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Let a waiting card through. Only the owner of the Fence it is on can; everyone else gets a plain 404. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await approveCard(user.id, (await params).id ?? '');
  return json({ ok: true });
});
