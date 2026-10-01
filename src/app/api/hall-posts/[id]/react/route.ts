import { requireSession } from '@/modules/auth';
import { setReaction } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { hallReactionSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** Give (`{on:true, kind?}`), change, or take back (`{on:false}`) your reaction to a post. One per person per post. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { on, kind } = await readJson(req, hallReactionSchema);
  return json(await setReaction(user.id, (await params).id ?? '', on, kind));
});
