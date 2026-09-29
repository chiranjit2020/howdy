import { requireSession } from '@/modules/auth';
import { getPortraitVersion } from '@/modules/media';
import { createReport } from '@/modules/moderation';
import { mayViewRanch, resolveHandle } from '@/modules/profiles';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { thingReportSchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/**
 * Flag someone's photo (ADR-025). Only someone who may see it can report it — the same rule as the photo itself — and a
 * missing person, a hidden Porch and "no photo" are all the same 404. The report names the exact version, so a moderator
 * acts on the photo that was reported, not on whatever replaced it. The owner is never told.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, thingReportSchema);
  const owner = await resolveHandle((await params).handle ?? '');
  if (!owner || owner.userId === user.id || !(await mayViewRanch(user.id, owner.userId))) {
    throw new AppError('NOT_FOUND');
  }
  const mediaId = await getPortraitVersion(owner.userId);
  if (!mediaId) throw new AppError('NOT_FOUND');
  await createReport(user.id, owner.userId, {
    reason: body.reason,
    details: body.details,
    about: { subject: 'portrait', mediaId },
  });
  return json({ ok: true }, { status: 202 });
});
