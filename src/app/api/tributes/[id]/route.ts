import { requireSession } from '@/modules/auth';
import { removeTribute, setTributePinned } from '@/modules/tributes';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { pinTributeSchema } from '@/shared/validation/tributes';

export const dynamic = 'force-dynamic';

/**
 * Take a Tribute down. Allowed for its author and for the Ranch owner it is on (waiting or already published); anyone
 * else (and anyone naming a Tribute that does not exist) gets the same 404.
 */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await removeTribute(user.id, (await params).id ?? '');
  return json({ ok: true });
});

/** Pin or unpin a published Tribute on your own Ranch. Owner only; pinning one silently unpins the last. */
export const PATCH = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { pinned } = await readJson(req, pinTributeSchema);
  await setTributePinned(user.id, (await params).id ?? '', pinned);
  return json({ ok: true });
});
