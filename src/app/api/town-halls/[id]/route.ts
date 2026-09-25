import { requireSession } from '@/modules/auth';
import { act, deleteTownHall, getTownHall, updateTownHall } from '@/modules/town-halls';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { townHallActionSchema, updateTownHallSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** One Town Hall. `invite` visibility is hidden (the same 404) from anyone without a membership row. */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const townHall = await getTownHall(user.id, (await params).id ?? '');
  if (!townHall) throw new AppError('NOT_FOUND');
  return json({ townHall });
});

/** Join, leave, accept an invite or decline one: `{ action }` from a closed set. The actor is always the signed-in user. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { action } = await readJson(req, townHallActionSchema);
  return json({ townHall: await act(user.id, (await params).id ?? '', action) });
});

/** Change name, description and/or visibility. Owner only. */
export const PATCH = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const patch = await readJson(req, updateTownHallSchema);
  return json({ townHall: await updateTownHall(user.id, (await params).id ?? '', patch) });
});

/** Delete the Town Hall and every membership in it. Owner only. */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await deleteTownHall(user.id, (await params).id ?? '');
  return json({ ok: true });
});
