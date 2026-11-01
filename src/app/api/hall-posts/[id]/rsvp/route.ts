import { requireSession } from '@/modules/auth';
import { answerEvent } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { rsvpSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** Answer an event: `{answer: 'going' | 'maybe' | 'no'}`, or `{answer: null}` to take it back (ADR-056). */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { answer } = await readJson(req, rsvpSchema);
  await answerEvent(user.id, (await params).id ?? '', answer);
  return json({ answer });
});
