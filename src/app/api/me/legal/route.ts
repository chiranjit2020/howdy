import { acceptCurrentTerms, pendingAcceptances, requireSession } from '@/modules/auth';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Which documents the signed-in person still has to agree to (usually none). */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ pending: await pendingAcceptances(user.id) });
});

/** Agree to the current Terms and Privacy Policy. Nothing in the body: the versions are always the current ones. */
export const POST = route(async ({ req, requestId }) => {
  const { user } = await requireSession(req);
  await acceptCurrentTerms(user.id, requestId);
  return json({ pending: [] });
});
