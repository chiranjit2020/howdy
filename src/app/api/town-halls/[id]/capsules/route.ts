import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { listHallCapsules, sealHallCapsule } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { AppError } from '@/platform/errors';
import { sealHallCapsuleSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** Time Capsules coming to this Town Hall: who and when, never the words (ADR-043). Active members only. */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const capsules = await listHallCapsules(user.id, (await params).id ?? '');
  if (!capsules) throw new AppError('NOT_FOUND');
  await attachPortraits(
    user.id,
    capsules.flatMap((c) => (c.from ? [c.from] : [])),
  );
  return json({ capsules });
});

/** Seal one for the whole Town Hall. The owner or a Deputy only; everyone else gets the same 404. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const input = await readJson(req, sealHallCapsuleSchema);
  const sealed = await sealHallCapsule(user.id, (await params).id ?? '', input);
  return json({ capsule: sealed }, { status: 201 });
});
