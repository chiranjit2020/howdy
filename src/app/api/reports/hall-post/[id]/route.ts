import { requireSession } from '@/modules/auth';
import { createReport } from '@/modules/moderation';
import { hallPostForReport } from '@/modules/town-halls';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { thingReportSchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/**
 * Flag a Town Hall post (ADR-033). Only a member who can see the post may report it; anything else is a plain 404. The
 * report goes against its writer, with the words kept as evidence. The writer is never told.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, thingReportSchema);
  const post = await hallPostForReport(user.id, (await params).id ?? '');
  if (!post || post.authorId === user.id) throw new AppError('NOT_FOUND');
  await createReport(user.id, post.authorId, {
    reason: body.reason,
    details: body.details,
    about: { subject: 'hall_post', hallPostId: post.id, evidence: post.body },
  });
  return json({ ok: true }, { status: 202 });
});
