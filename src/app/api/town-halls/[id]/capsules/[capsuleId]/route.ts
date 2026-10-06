import { requireSession } from '@/modules/auth';
import { takeBackHallCapsule } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Take a Town Hall Time Capsule back before it opens: its writer, or staff who outrank them (ADR-043). */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const p = await params;
  await takeBackHallCapsule(user.id, p.id ?? '', p.capsuleId ?? '');
  return json({ ok: true });
});
