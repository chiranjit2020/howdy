import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { createPost } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { createEventSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/**
 * Post an event to a group (ADR-056): a post that is also an invitation. Any active member; anyone else gets the same
 * 404 as a missing group. It follows every rule a post does (limits, holding), and its details are its words — or its
 * name, when there are none.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { title, startsAt, place, details } = await readJson(req, createEventSchema);
  const post = await createPost(user.id, (await params).id ?? '', details ?? title, undefined, {
    title,
    startsAt,
    place,
  });
  await attachPortraits(user.id, [post.author]);
  return json({ post }, { status: 201 });
});
