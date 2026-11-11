import { markAppInstalled, requireSession } from '@/modules/auth';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/**
 * Howdy was opened as the installed app (or the browser just installed it): remember it on the account, so Home stops
 * showing "Get the Howdy app" in every browser this person uses. Nothing in the body; calling it again changes nothing.
 */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  await markAppInstalled(user.id);
  return json({ ok: true });
});
