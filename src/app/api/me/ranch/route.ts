import { requireSession } from '@/modules/auth';
import { getOwnRanch, updateRanch } from '@/modules/profiles';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { updateRanchSchema } from '@/shared/validation/profile';

export const dynamic = 'force-dynamic';

/** My own Ranch, including my privacy settings. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ ranch: await getOwnRanch(user.id) });
});

/**
 * Tend the Ranch. There is deliberately no id in the URL or body: the target is always the signed-in user, so one user
 * cannot even address another's Ranch. Only whitelisted fields are read; anything else in the body is dropped.
 */
export const PATCH = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const patch = await readJson(req, updateRanchSchema);
  return json({ ranch: await updateRanch(user.id, patch) });
});
