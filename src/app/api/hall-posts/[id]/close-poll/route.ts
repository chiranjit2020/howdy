import { requireSession } from '@/modules/auth';
import { closePoll } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Close a poll for good (ADR-057). Whoever asked it, or the owner or a Deputy; anyone else gets the same 404. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await closePoll(user.id, (await params).id ?? '');
  return json({ ok: true });
});
