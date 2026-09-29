import { requireSession } from '@/modules/auth';
import { listAppeals } from '@/modules/moderation';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';
import { appealsQuerySchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/** One page of open appeals, oldest first. Moderators only; 404 to anyone else. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const query = appealsQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  return json(await listAppeals(user.id, query.data));
});
