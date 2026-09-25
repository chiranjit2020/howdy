import { requireSession } from '@/modules/auth';
import { createTownHall, listDirectory } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { AppError } from '@/platform/errors';
import { createTownHallSchema, townHallsQuerySchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** One page of the directory: open and members-visibility Town Halls, newest first. Invite-only ones never appear. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const query = townHallsQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  return json(await listDirectory(user.id, { cursor: query.data.cursor, limit: query.data.limit }));
});

/** Start a new Town Hall. The creator becomes its owner at once. */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, createTownHallSchema);
  return json({ townHall: await createTownHall(user.id, body) }, { status: 201 });
});
