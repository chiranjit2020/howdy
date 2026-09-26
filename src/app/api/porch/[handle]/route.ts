import { optionalSession, requestContext } from '@/modules/auth';
import type { Actor } from '@/modules/authz';
import { getRanchForViewer } from '@/modules/profiles';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/**
 * Open a Ranch. Missing, hidden and forbidden are all the same 404, so the response never confirms a Ranch the caller
 * may not see. The projection never includes email, ids or privacy settings.
 */
export const GET = route(async ({ req, requestId, params }) => {
  const { handle } = await params;
  const session = await optionalSession(req);
  const viewer: Actor = session
    ? { kind: 'user', id: session.user.id, status: 'active' }
    : { kind: 'anonymous' };
  const rateKey = session?.user.id ?? requestContext(req, requestId).ip;
  const ranch = await getRanchForViewer(viewer, handle ?? '', { rateKey });
  if (!ranch) throw new AppError('NOT_FOUND');
  return json({ ranch });
});
