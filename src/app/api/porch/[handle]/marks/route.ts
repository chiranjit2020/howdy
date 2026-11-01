import { optionalSession, requestContext, requireSession } from '@/modules/auth';
import type { Actor } from '@/modules/authz';
import { getDescription, giveMark, takeBackMark } from '@/modules/marks';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { giveMarkSchema } from '@/shared/validation/marks';

export const dynamic = 'force-dynamic';

/** How a Ranch is described (ADR-052): its top words and the viewer's own pick. Same visibility as the Ranch. */
export const GET = route(async ({ req, requestId, params }) => {
  const session = await optionalSession(req);
  const viewer: Actor = session
    ? { kind: 'user', id: session.user.id, status: 'active' }
    : { kind: 'anonymous' };
  const rateKey = session?.user.id ?? requestContext(req, requestId).ip;
  const description = await getDescription(viewer, (await params).handle ?? '', { rateKey });
  if (!description) throw new AppError('NOT_FOUND');
  return json(description);
});

/** Pick (or change) the word that describes them. Friends and group neighbours only; everyone else gets the same 403. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { kind } = await readJson(req, giveMarkSchema);
  return json(await giveMark(user.id, (await params).handle ?? '', kind), { status: 201 });
});

/** Take back my pick for them. */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  return json(await takeBackMark(user.id, (await params).handle ?? ''));
});
