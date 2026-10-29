import { z } from 'zod';
import { requireSession } from '@/modules/auth';
import { searchPeople } from '@/modules/suggestions';
import { attachPortraits } from '@/app/_lib/social';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ q: z.string().max(60) });

/**
 * People search for the search bar: only people who let themselves be found, plus your friends (see searchPeople).
 * Signed-in people only, rate limited. Results are names, @usernames and (where you may see it) a photo; never an id.
 */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const query = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  const people = await searchPeople(user.id, query.data.q);
  await attachPortraits(user.id, people);
  return json({ people });
});
