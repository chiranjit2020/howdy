import { requireSession } from '@/modules/auth';
import { listFriendsFeed } from '@/modules/fence';
import { attachPortraits } from '@/app/_lib/social';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';
import { fenceQuerySchema } from '@/shared/validation/fence';

export const dynamic = 'force-dynamic';

/**
 * One page of Home's feed: the newest posts on the walls of the signed-in person's friends (and their own), each wall
 * included only if they may read it. `?cursor=` continues from the previous page; the cursor is opaque and grants nothing.
 */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const query = fenceQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  const page = await listFriendsFeed(user.id, {
    rateKey: user.id,
    cursor: query.data.cursor,
    limit: query.data.limit,
  });
  await attachPortraits(
    user.id,
    page.cards.flatMap((c) => [c.author, c.wall, ...c.replies.map((r) => r.author)]),
  );
  return json(page);
});
