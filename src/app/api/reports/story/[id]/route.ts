import { requireSession } from '@/modules/auth';
import { createReport } from '@/modules/moderation';
import { storyForReport } from '@/modules/stories';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { thingReportSchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/**
 * Flag a Story (ADR-047). Only someone who may see it may report it; anything else is a plain 404. The report is about
 * its photo, with the caption kept as evidence; a moderator can take the photo down. The author is never told.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, thingReportSchema);
  const story = await storyForReport(user.id, (await params).id ?? '');
  if (!story) throw new AppError('NOT_FOUND');
  await createReport(user.id, story.authorId, {
    reason: body.reason,
    details: body.details,
    about: { subject: 'card_photo', mediaId: story.mediaId, evidence: story.caption ?? '' },
  });
  return json({ ok: true }, { status: 202 });
});
