import { targetFor } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { createReport } from '@/modules/moderation';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { reportSchema } from '@/shared/validation/moderation';

/**
 * Flag trouble. Works even when the target has blocked the reporter (someone being harassed must still be able to report).
 * The answer is always the same 202, whether the report was new or already open, and the reported person is never told.
 */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, reportSchema);
  const target = await targetFor(body.handle);
  await createReport(user.id, target.userId, body.reason, body.details);
  return json({ ok: true }, { status: 202 });
});
