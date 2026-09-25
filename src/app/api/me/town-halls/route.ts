import { requireSession } from '@/modules/auth';
import { listMine } from '@/modules/town-halls';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Every Town Hall I currently belong to (owner or member), whatever its visibility. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ townHalls: await listMine(user.id) });
});
