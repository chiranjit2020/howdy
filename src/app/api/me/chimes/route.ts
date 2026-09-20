import { requireSession } from '@/modules/auth';
import { listChimes } from '@/modules/notifications';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';
import { chimeQuerySchema } from '@/shared/validation/chimes';

export const dynamic = 'force-dynamic';

/**
 * My Chimes, newest first. The person is always the signed-in user (there is no id to change). What is shown is decided now,
 * from the current relationships — a Chime about someone I have since blocked or muted is simply not here.
 */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const query = chimeQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  return json(await listChimes(user.id, query.data));
});
