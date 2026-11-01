import { requireSession } from '@/modules/auth';
import { sendFeedback } from '@/modules/feedback';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { sendFeedbackSchema } from '@/shared/validation/feedback';

export const dynamic = 'force-dynamic';

/** Send feedback about Howdy (ADR-059). Always from the signed-in person: there is no "from" to change. */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const input = await readJson(req, sendFeedbackSchema);
  return json(await sendFeedback(user.id, input), { status: 201 });
});
