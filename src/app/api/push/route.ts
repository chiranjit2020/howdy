import { requireSession } from '@/modules/auth';
import { subscribe, unsubscribe } from '@/modules/push';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { pushSubscribeSchema, pushUnsubscribeSchema } from '@/shared/validation/push';

export const dynamic = 'force-dynamic';

/**
 * This device wants notifications while Howdy is closed: `PushSubscription.toJSON()`. Stored against the CURRENT session, so
 * signing out silences it. The person is always me; the endpoint must belong to a real push service.
 */
export const POST = route(async ({ req }) => {
  const { user, sessionId } = await requireSession(req);
  const input = await readJson(req, pushSubscribeSchema);
  await subscribe({ userId: user.id, sessionId }, input);
  return json({ ok: true });
});

/** This device no longer wants them. */
export const DELETE = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const { endpoint } = await readJson(req, pushUnsubscribeSchema);
  await unsubscribe(user.id, endpoint);
  return json({ ok: true });
});
