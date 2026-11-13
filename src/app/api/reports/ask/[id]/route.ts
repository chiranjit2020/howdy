import { askForReport } from '@/modules/asks';
import { requireSession } from '@/modules/auth';
import { createReport } from '@/modules/moderation';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { thingReportSchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/**
 * Flag a public "Buy or wait?" (ADR-066). Only someone who can see it may report it; anything else is a plain 404. The
 * report goes against its asker, with the words kept as evidence. The asker is never told.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, thingReportSchema);
  const ask = await askForReport(user.id, (await params).id ?? '');
  if (!ask || ask.authorId === user.id) throw new AppError('NOT_FOUND');
  await createReport(user.id, ask.authorId, {
    reason: body.reason,
    details: body.details,
    about: { subject: 'ask', askId: ask.id, evidence: ask.evidence },
  });
  return json({ ok: true }, { status: 202 });
});
