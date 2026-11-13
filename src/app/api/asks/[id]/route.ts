import { removePublicAsk } from '@/modules/asks';
import { requireSession } from '@/modules/auth';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Take my question down, with its answers. Anyone else gets the same 404 as a question that is not there. */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await removePublicAsk(user.id, (await params).id ?? '');
  return json({ ok: true });
});
