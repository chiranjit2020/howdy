import { requireSession } from '@/modules/auth';
import { myInvite, resetInvite } from '@/modules/invites';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** My personal invite link (ADR-045), made the first time I ask; and how many joined through it this week. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ invite: await myInvite(user.id) });
});

/** Reset my link: a new code, and the old link stops working at once. */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ invite: await resetInvite(user.id) });
});
