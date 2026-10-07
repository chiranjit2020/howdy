import { requireSession } from '@/modules/auth';
import { markViewed } from '@/modules/stories';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** I opened this Story. Whether its author sees that is decided by both our Story-views switches (ADR-047). */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await markViewed(user.id, (await params).id ?? '');
  return json({ ok: true });
});
