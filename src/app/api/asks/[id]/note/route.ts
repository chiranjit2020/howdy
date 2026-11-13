import { withAskPortraits } from '@/app/_lib/asks';
import { notePublicAsk } from '@/modules/asks';
import { requireSession } from '@/modules/auth';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { askNoteSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** The asker's one update (ADR-066). A second one is a 409. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { note } = await readJson(req, askNoteSchema);
  const ask = await notePublicAsk(user.id, (await params).id ?? '', note);
  await withAskPortraits(user.id, [ask]);
  return json({ ask });
});
