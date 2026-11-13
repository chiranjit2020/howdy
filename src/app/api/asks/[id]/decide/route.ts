import { withAskPortraits } from '@/app/_lib/asks';
import { decidePublicAsk } from '@/modules/asks';
import { requireSession } from '@/modules/auth';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { askDecideSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** Say what you decided: bought, waiting or skipped (ADR-066). Answers close. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { outcome } = await readJson(req, askDecideSchema);
  const ask = await decidePublicAsk(user.id, (await params).id ?? '', outcome);
  await withAskPortraits(user.id, [ask]);
  return json({ ask });
});
