import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { noteAsk } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { askNoteSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** The asker's one update on their "Buy or wait?" (ADR-065). A second one is a 409. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { note } = await readJson(req, askNoteSchema);
  const ask = await noteAsk(user.id, (await params).id ?? '', note);
  await attachPortraits(
    user.id,
    ask.answers.map((a) => a.author),
  );
  return json({ ask });
});
