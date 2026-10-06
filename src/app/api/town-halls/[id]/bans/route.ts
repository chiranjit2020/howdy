import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { banPerson, listBans } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { banFromTownHallSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** Who is banned from this Town Hall (ADR-042). The owner or a Deputy only; everyone else gets the same 404. */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const bans = await listBans(user.id, (await params).id ?? '');
  await attachPortraits(user.id, bans);
  return json({ bans });
});

/** Ban someone by call sign: they lose any membership here and cannot join again. Never announced to them. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { handle } = await readJson(req, banFromTownHallSchema);
  await banPerson(user.id, (await params).id ?? '', handle);
  return json({ ok: true });
});
