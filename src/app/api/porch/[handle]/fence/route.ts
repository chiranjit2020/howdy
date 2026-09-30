import { optionalSession, requestContext, requireSession } from '@/modules/auth';
import type { Actor } from '@/modules/authz';
import { listFence, postCard } from '@/modules/fence';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { fenceQuerySchema, postCardSchema } from '@/shared/validation/fence';

export const dynamic = 'force-dynamic';

/**
 * One page of a Fence. Missing, inactive and hidden are the same 404 (a Fence the caller may not read is never confirmed).
 * `?cursor=` continues from the previous page; the cursor is opaque and validated, and grants nothing.
 */
export const GET = route(async ({ req, requestId, params }) => {
  const query = fenceQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  const session = await optionalSession(req);
  const viewer: Actor = session
    ? { kind: 'user', id: session.user.id, status: 'active' }
    : { kind: 'anonymous' };
  const rateKey = session?.user.id ?? requestContext(req, requestId).ip;

  const page = await listFence(viewer, (await params).handle ?? '', {
    rateKey,
    cursor: query.data.cursor,
    limit: query.data.limit,
  });
  if (!page) throw new AppError('NOT_FOUND');
  return json(page);
});

/**
 * Nail a Post Card. The writer is always the signed-in user; the Fence comes from the URL. Whether the card appears at once
 * or waits for the owner is decided by the server, and a restricted writer gets exactly the answer everyone else gets.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { body, photoId } = await readJson(req, postCardSchema);
  return json({ card: await postCard(user.id, (await params).handle ?? '', body, photoId) }, { status: 201 });
});
