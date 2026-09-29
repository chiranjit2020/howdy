import { requireSession } from '@/modules/auth';
import { createReport } from '@/modules/moderation';
import { townHallForReport } from '@/modules/town-halls';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { thingReportSchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/**
 * Flag a Town Hall (ADR-025): the report goes against its owner, with its name and description kept as evidence. Only
 * someone who may see it can report it; anything else is a plain 404. The owner is never told.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, thingReportSchema);
  const hall = await townHallForReport(user.id, (await params).id ?? '');
  if (!hall || hall.ownerId === user.id) throw new AppError('NOT_FOUND');
  await createReport(user.id, hall.ownerId, {
    reason: body.reason,
    details: body.details,
    about: { subject: 'town_hall', townHallId: hall.id, evidence: `${hall.name}\n\n${hall.description}` },
  });
  return json({ ok: true }, { status: 202 });
});
