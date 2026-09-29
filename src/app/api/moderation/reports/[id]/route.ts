import { requireSession } from '@/modules/auth';
import { retirePortrait } from '@/modules/media';
import {
  dismissReport,
  removeReportedCard,
  removeReportedPortrait,
  removeReportedTownHall,
  removeReportedWhisper,
  suspendFromReport,
} from '@/modules/moderation';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { reportActionSchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/**
 * Act on one open report: `{ action }` from a closed set — dismiss, remove the reported thing (`remove_card`,
 * `remove_portrait`, `remove_whisper`, `remove_town_hall`, each only for a report about that kind of thing), or suspend
 * (with a `length` and optionally a `reason`). Every action closes the report; a report someone already closed answers
 * 409. Moderators only; 404 to anyone else.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, reportActionSchema);
  const id = (await params).id ?? '';
  switch (body.action) {
    case 'suspend':
      await suspendFromReport(user.id, id, { length: body.length, reason: body.reason });
      break;
    case 'remove_card':
      await removeReportedCard(user.id, id);
      break;
    case 'remove_portrait':
      // The file is in object storage, which only the media module touches: moderation is handed the removal.
      await removeReportedPortrait(user.id, id, retirePortrait);
      break;
    case 'remove_whisper':
      await removeReportedWhisper(user.id, id);
      break;
    case 'remove_town_hall':
      await removeReportedTownHall(user.id, id);
      break;
    case 'dismiss':
      await dismissReport(user.id, id);
      break;
  }
  return json({ ok: true });
});
