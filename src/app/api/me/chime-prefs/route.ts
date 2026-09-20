import { requireSession } from '@/modules/auth';
import { getPrefs, setPrefs } from '@/modules/notifications';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { chimePrefsSchema } from '@/shared/validation/chimes';

export const dynamic = 'force-dynamic';

/** Which kinds of Chime I want. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ prefs: await getPrefs(user.id) });
});

/** Switch kinds on or off. Only my own preferences; unknown keys are dropped. */
export const PATCH = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const patch = await readJson(req, chimePrefsSchema);
  return json({ prefs: await setPrefs(user.id, patch) });
});
