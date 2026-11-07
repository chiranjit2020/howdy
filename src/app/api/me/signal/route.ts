import { requireSession } from '@/modules/auth';
import { clearSignal, setSignal } from '@/modules/profiles';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { setSignalSchema } from '@/shared/validation/profile';

/** Set the team's "What's new" note. It stays until removed. */
export const PUT = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const { text } = await readJson(req, setSignalSchema);
  return json({ ranch: await setSignal(user.id, text) });
});

export const DELETE = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ ranch: await clearSignal(user.id) });
});
