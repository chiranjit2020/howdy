import { requireSession } from '@/modules/auth';
import { approvePost } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Let a held post through. The Town Hall's owner only; anyone else gets a 404. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await approvePost(user.id, (await params).id ?? '');
  return json({ ok: true });
});
