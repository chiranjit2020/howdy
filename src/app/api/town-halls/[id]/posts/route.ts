import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { createPost, listFeed } from '@/modules/town-halls';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { hallFeedQuerySchema, hallPostSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/**
 * One page of a Town Hall's feed (ADR-033). Active members only: anyone else gets the same 404 as a missing Town Hall.
 * `?cursor=` continues from the previous page; the cursor is opaque and validated, and grants nothing.
 */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const query = hallFeedQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  const page = await listFeed(user.id, (await params).id ?? '', {
    cursor: query.data.cursor,
    limit: query.data.limit,
  });
  if (!page) throw new AppError('NOT_FOUND');
  await attachPortraits(
    user.id,
    page.posts.flatMap((p) => [p.author, ...p.replies.map((r) => r.author)]),
  );
  return json(page);
});

/** Post to the feed. The writer is always the signed-in user; whether it is held is the server's call, and never said. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { body } = await readJson(req, hallPostSchema);
  const post = await createPost(user.id, (await params).id ?? '', body);
  await attachPortraits(user.id, [post.author]);
  return json({ post }, { status: 201 });
});
