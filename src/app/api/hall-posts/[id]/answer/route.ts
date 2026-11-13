import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { answerAsk } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { askAnswerSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** Answer a "Buy or wait?": `{verdict, reason}`, or `{verdict: null}` to take the answer back (ADR-065). */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { verdict, reason } = await readJson(req, askAnswerSchema);
  const ask = await answerAsk(
    user.id,
    (await params).id ?? '',
    verdict ? { verdict, reason: reason ?? '' } : null,
  );
  await attachPortraits(
    user.id,
    ask.answers.map((a) => a.author),
  );
  return json({ ask });
});
