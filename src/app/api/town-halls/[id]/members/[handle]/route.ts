import { requireSession } from '@/modules/auth';
import { removeMember } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Remove a member, or revoke a still-pending invite. Owner only; nobody else can tell which is which, or that it exists. */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const p = await params;
  await removeMember(user.id, p.id ?? '', p.handle ?? '');
  return json({ ok: true });
});
