import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { decideAsk } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { askDecideSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** Say what you decided on your "Buy or wait?": bought, waiting or skipped (ADR-065). Answers close. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { outcome } = await readJson(req, askDecideSchema);
  const ask = await decideAsk(user.id, (await params).id ?? '', outcome);
  await attachPortraits(
    user.id,
    ask.answers.map((a) => a.author),
  );
  return json({ ask });
});
