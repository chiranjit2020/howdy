import { requireSession } from '@/modules/auth';
import { cardForReport } from '@/modules/fence';
import { createReport } from '@/modules/moderation';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { cardReportSchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/**
 * Flag a Post Card. The reader must be able to see the card (otherwise a plain 404). The report goes against the card's
 * writer, with the card's words kept as evidence in case the card is later removed. The writer is never told.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, cardReportSchema);
  const card = await cardForReport(user.id, (await params).id ?? '');
  if (!card) throw new AppError('NOT_FOUND');
  await createReport(user.id, card.authorId, {
    reason: body.reason,
    details: body.details,
    about: { subject: 'card', cardId: card.id, evidence: card.body },
  });
  return json({ ok: true }, { status: 202 });
});
