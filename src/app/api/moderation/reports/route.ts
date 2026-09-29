import { requireSession } from '@/modules/auth';
import { listQueue } from '@/modules/moderation';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';
import { queueQuerySchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/** One page of the moderation queue, newest first (`open` unless `?status=` says otherwise). Moderators only; 404 to anyone else. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const query = queueQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  return json(await listQueue(user.id, query.data));
});
