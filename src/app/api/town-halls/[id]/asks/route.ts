import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { createAsk } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { createAskSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/**
 * Ask the group "Buy or wait?" (ADR-065): the item, its price in rupees, why (the post's words), an optional alternative
 * and photo. Any active member, a few a day; anyone else gets the same 404 as a missing group.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const input = await readJson(req, createAskSchema);
  const post = await createAsk(user.id, (await params).id ?? '', input);
  await attachPortraits(user.id, [post.author]);
  return json({ post }, { status: 201 });
});
