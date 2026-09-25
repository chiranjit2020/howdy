import { requireSession } from '@/modules/auth';
import { approveTribute } from '@/modules/tributes';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Let a waiting Tribute through. Only the Ranch owner it is on can; everyone else gets a plain 404. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await approveTribute(user.id, (await params).id ?? '');
  return json({ ok: true });
});
