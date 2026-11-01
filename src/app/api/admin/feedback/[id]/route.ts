import { requireSession } from '@/modules/auth';
import { setFeedbackStatus } from '@/modules/feedback';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { feedbackStatusSchema } from '@/shared/validation/feedback';
import { idParamSchema } from '@/shared/validation/fence';

export const dynamic = 'force-dynamic';

/** Mark feedback new, read or done. Admins with two-step only; to anyone else this does not exist (404). */
export const PATCH = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const id = idParamSchema.safeParse((await params).id);
  if (!id.success) throw new AppError('NOT_FOUND');
  const { status } = await readJson(req, feedbackStatusSchema);
  await setFeedbackStatus(user.id, id.data, status);
  return json({ ok: true });
});
