import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { createPost } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { createPollSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/**
 * Post a poll to a group (ADR-057): a post whose words are its question, with two to four options. Any active member;
 * anyone else gets the same 404 as a missing group. It follows every rule a post does (limits, holding).
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { question, options } = await readJson(req, createPollSchema);
  const post = await createPost(user.id, (await params).id ?? '', question, undefined, undefined, {
    options,
  });
  await attachPortraits(user.id, [post.author]);
  return json({ post }, { status: 201 });
});
