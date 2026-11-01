import { requireSession } from '@/modules/auth';
import { votePoll } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { pollVoteSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** Vote in a poll: `{optionId}` (one of its own options), or `{optionId: null}` to take the vote back (ADR-057). */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { optionId } = await readJson(req, pollVoteSchema);
  await votePoll(user.id, (await params).id ?? '', optionId);
  return json({ optionId });
});
