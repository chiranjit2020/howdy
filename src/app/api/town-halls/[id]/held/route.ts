import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { listHeld } from '@/modules/town-halls';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Posts and replies held for the owner's OK (ADR-033). Owner only; anyone else gets a 404. */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const held = await listHeld(user.id, (await params).id ?? '');
  if (!held) throw new AppError('NOT_FOUND');
  await attachPortraits(
    user.id,
    [...held.posts, ...held.replies].map((h) => h.author),
  );
  return json(held);
});
