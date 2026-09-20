import { requireSession } from '@/modules/auth';
import { approveReply } from '@/modules/fence';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Let a waiting reply through. Fence owner only; anyone else gets a plain 404. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await approveReply(user.id, (await params).id ?? '');
  return json({ ok: true });
});
