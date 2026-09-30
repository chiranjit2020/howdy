import { requireSession } from '@/modules/auth';
import { listMembers } from '@/modules/town-halls';
import { attachPortraits } from '@/app/_lib/social';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';
import { townHallsQuerySchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** A Town Hall's roster, paginated. Active members only — anyone else gets the same 404 as a missing Town Hall. */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const query = townHallsQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  const page = await listMembers(user.id, (await params).id ?? '', {
    cursor: query.data.cursor,
    limit: query.data.limit,
  });
  if (!page) throw new AppError('NOT_FOUND');
  await attachPortraits(user.id, page.members);
  return json(page);
});
