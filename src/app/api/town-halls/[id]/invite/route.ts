import { requireSession } from '@/modules/auth';
import { invite } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { inviteToTownHallSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** Invite someone by call sign. Owner only; a repeat invite is a harmless no-op. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { handle } = await readJson(req, inviteToTownHallSchema);
  await invite(user.id, (await params).id ?? '', handle);
  return json({ ok: true });
});
