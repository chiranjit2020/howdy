import { requireSession } from '@/modules/auth';
import { myDetails, updateMyDetails } from '@/modules/profiles';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { updateDetailsSchema } from '@/shared/validation/details';

export const dynamic = 'force-dynamic';

/** My own personal details, with who sees each. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ details: await myDetails(user.id) });
});

/**
 * Change my personal details and their audiences. No id anywhere: the target is always the signed-in user. Only the
 * whitelisted fields are read (unknown keys are dropped).
 */
export const PATCH = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const patch = await readJson(req, updateDetailsSchema);
  return json({ details: await updateMyDetails(user.id, patch) });
});
