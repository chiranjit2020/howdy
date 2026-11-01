import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { clearChimes, listChimes } from '@/modules/notifications';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { chimeQuerySchema, clearChimesSchema } from '@/shared/validation/chimes';

export const dynamic = 'force-dynamic';

/**
 * My Chimes, newest first. The person is always the signed-in user (there is no id to change). What is shown is decided now,
 * from the current relationships — a Chime about someone I have since blocked or muted is simply not here.
 */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const query = chimeQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  const page = await listChimes(user.id, query.data);
  await attachPortraits(
    user.id,
    page.chimes.map((c) => c.actor),
  );
  return json(page);
});

/** "Clear all": delete my own Chimes, up to what my page showed (`before`). Only ever mine: there is no id to change. */
export const DELETE = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const { before } = await readJson(req, clearChimesSchema);
  return json(await clearChimes(user.id, before));
});
