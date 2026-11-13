import { withAskPortraits } from '@/app/_lib/asks';
import { answerPublicAsk } from '@/modules/asks';
import { requireSession } from '@/modules/auth';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { askAnswerSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** Answer a public question: `{verdict, reason}`, or `{verdict: null}` to take it back (ADR-066). */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { verdict, reason } = await readJson(req, askAnswerSchema);
  const ask = await answerPublicAsk(
    user.id,
    (await params).id ?? '',
    verdict ? { verdict, reason: reason ?? '' } : null,
  );
  await withAskPortraits(user.id, [ask]);
  return json({ ask });
});
