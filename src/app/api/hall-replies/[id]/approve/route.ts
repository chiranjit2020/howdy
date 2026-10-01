import { requireSession } from '@/modules/auth';
import { approveReply } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Let a held reply through. The Town Hall's owner only; anyone else gets a 404. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await approveReply(user.id, (await params).id ?? '');
  return json({ ok: true });
});
