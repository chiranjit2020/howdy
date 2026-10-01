import { requireSession } from '@/modules/auth';
import { attachPortraits } from '@/app/_lib/social';
import { litPals } from '@/modules/lights';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** My Pals whose Porch Light is on for me right now (ADR-032). */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const lit = await litPals(user.id);
  await attachPortraits(
    user.id,
    lit.map((l) => l.pal),
  );
  return json({ lit });
});
