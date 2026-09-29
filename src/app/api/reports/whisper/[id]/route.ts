import { requireSession } from '@/modules/auth';
import { createReport } from '@/modules/moderation';
import { messageForReport } from '@/modules/whispers';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { thingReportSchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/**
 * Flag one Whisper someone sent me (ADR-025). Works after a block too. Only that message's words are kept as evidence:
 * a moderator never sees the rest of the thread. Anything I did not receive is a plain 404. The sender is never told.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, thingReportSchema);
  const message = await messageForReport(user.id, (await params).id ?? '');
  if (!message) throw new AppError('NOT_FOUND');
  await createReport(user.id, message.senderId, {
    reason: body.reason,
    details: body.details,
    about: { subject: 'whisper', messageId: message.id, evidence: message.body },
  });
  return json({ ok: true }, { status: 202 });
});
