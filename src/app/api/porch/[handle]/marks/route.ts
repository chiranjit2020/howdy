import { optionalSession, requestContext, requireSession } from '@/modules/auth';
import type { Actor } from '@/modules/authz';
import { getVibeMatrix, giveMark } from '@/modules/marks';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { giveMarkSchema } from '@/shared/validation/marks';

export const dynamic = 'force-dynamic';

/** A Ranch's Vibe Matrix: the aggregate count of each kind of Mark the owner has received. Same visibility as the Ranch. */
export const GET = route(async ({ req, requestId, params }) => {
  const session = await optionalSession(req);
  const viewer: Actor = session
    ? { kind: 'user', id: session.user.id, status: 'active' }
    : { kind: 'anonymous' };
  const rateKey = session?.user.id ?? requestContext(req, requestId).ip;

  const matrix = await getVibeMatrix(viewer, (await params).handle ?? '', { rateKey });
  if (!matrix) throw new AppError('NOT_FOUND');
  return json(matrix);
});

/** Award a Mark. Only their Posse may, and only once every 30 days per pair — everyone else gets the same 403 or 409. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { kind } = await readJson(req, giveMarkSchema);
  return json(await giveMark(user.id, (await params).handle ?? '', kind), { status: 201 });
});
