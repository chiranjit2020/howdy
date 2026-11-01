import { requireSession } from '@/modules/auth';
import { pinPost, unpinPost } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/**
 * Pin this post to the top of its group's feed (POST) or unpin it (DELETE). The owner or a Deputy, a published post;
 * anyone else, and any post they may not pin, gets the same 404.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await pinPost(user.id, (await params).id ?? '');
  return json({ ok: true });
});

export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await unpinPost(user.id, (await params).id ?? '');
  return json({ ok: true });
});
