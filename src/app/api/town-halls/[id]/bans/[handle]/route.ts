import { requireSession } from '@/modules/auth';
import { liftBan } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Lift a ban (owner or a Deputy). It does not let them back in; they may join again like anyone. */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const p = await params;
  await liftBan(user.id, p.id ?? '', p.handle ?? '');
  return json({ ok: true });
});
