import { optionalSession, requestContext, requireSession } from '@/modules/auth';
import type { Actor } from '@/modules/authz';
import { giveTribute, listTributes } from '@/modules/tributes';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { giveTributeSchema, tributesQuerySchema } from '@/shared/validation/tributes';

export const dynamic = 'force-dynamic';

/**
 * One page of a Ranch's Tributes, pinned one leading. Missing, inactive and hidden are the same 404 (a Ranch the caller
 * may not read is never confirmed). `?cursor=` continues from the previous page; the cursor is opaque and validated.
 */
export const GET = route(async ({ req, requestId, params }) => {
  const query = tributesQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  const session = await optionalSession(req);
  const viewer: Actor = session
    ? { kind: 'user', id: session.user.id, status: 'active' }
    : { kind: 'anonymous' };
  const rateKey = session?.user.id ?? requestContext(req, requestId).ip;

  const page = await listTributes(viewer, (await params).handle ?? '', {
    rateKey,
    cursor: query.data.cursor,
    limit: query.data.limit,
  });
  if (!page) throw new AppError('NOT_FOUND');
  return json(page);
});

/** Leave a Tribute for the person with this call sign. Only their Posse may — everyone else gets the same 403. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { body } = await readJson(req, giveTributeSchema);
  return json({ tribute: await giveTribute(user.id, (await params).handle ?? '', body) }, { status: 201 });
});
