import { requireSession } from '@/modules/auth';
import { myCapsules, sealCapsule } from '@/modules/capsules';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { sealCapsuleSchema } from '@/shared/validation/capsules';

export const dynamic = 'force-dynamic';

/** My Time Capsules: opened (with words), coming to me (who + when), and sealed by me (to whom + when). ADR-028. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json(await myCapsules(user.id));
});

/** Seal one, for me or one of my Pals. The words are not shown again until it opens — not even to me. */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, sealCapsuleSchema);
  return json(await sealCapsule(user.id, body), { status: 201 });
});
