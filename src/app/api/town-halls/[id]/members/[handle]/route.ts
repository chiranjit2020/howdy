import { requireSession } from '@/modules/auth';
import { memberAction, removeMember } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { memberActionSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/**
 * Remove a member, or revoke a pending invite or request. The owner or a Deputy (a Deputy only ordinary members);
 * nobody else can tell which is which, or that it exists.
 */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const p = await params;
  await removeMember(user.id, p.id ?? '', p.handle ?? '');
  return json({ ok: true });
});

/** A staff decision about one person (ADR-041): answer a join request, appoint or stand down a Deputy, hand over. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { action } = await readJson(req, memberActionSchema);
  const p = await params;
  await memberAction(user.id, p.id ?? '', p.handle ?? '', action);
  return json({ ok: true });
});
