import { requireSession } from '@/modules/auth';
import { myLight, switchOff, switchOn } from '@/modules/lights';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { switchOnLightSchema } from '@/shared/validation/lights';

export const dynamic = 'force-dynamic';

/** My Porch Light (ADR-032): on until when, for whom, with what note — or null when it is off. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ light: await myLight(user.id) });
});

/** Switch it on for 30, 60 or 120 minutes, for all my Pals or only my Close Pals. Again while on starts it over. */
export const PUT = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, switchOnLightSchema);
  return json({ light: await switchOn(user.id, body) });
});

/** Switch it off. Nothing about it is kept. */
export const DELETE = route(async ({ req }) => {
  const { user } = await requireSession(req);
  await switchOff(user.id);
  return json({ light: null });
});
