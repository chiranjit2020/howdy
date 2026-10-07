import { requireSession } from '@/modules/auth';
import { removeStory } from '@/modules/stories';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Take my Story down before its 12 hours are up. */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await removeStory(user.id, (await params).id ?? '');
  return json({ ok: true });
});
