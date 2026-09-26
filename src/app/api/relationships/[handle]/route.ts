import { targetFor } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { mayViewRanch } from '@/modules/profiles';
import { act, getRelationshipView } from '@/modules/relationships';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { relationshipActionSchema } from '@/shared/validation/relationships';

export const dynamic = 'force-dynamic';

/** My relationship with one person. If they blocked me this is a plain 404 — indistinguishable from "no such person". */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const target = await targetFor((await params).handle);
  if (target.userId === user.id) throw new AppError('NOT_FOUND');
  const relationship = await getRelationshipView(user.id, target.userId);
  if (!relationship) throw new AppError('NOT_FOUND');
  return json({
    person: { handle: target.handle, displayName: target.displayName, portraitTint: target.portraitTint },
    relationship,
  });
});

/** Do something about my relationship with one person: `{ action }` from a closed set. The actor is always the signed-in user. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { action } = await readJson(req, relationshipActionSchema);
  const target = await targetFor((await params).handle);
  // Scouting says "show me their things", so it needs the right to see them; it never grants that right.
  if (action === 'scout' && !(await mayViewRanch(user.id, target.userId))) throw new AppError('NOT_FOUND');
  // The Howdy team account cannot be blocked: it is how everyone hears what is new. Muting it still works, for anyone
  // who would rather not see it.
  if (action === 'block' && target.verified) {
    throw new AppError('FORBIDDEN', {
      message: 'The Howdy team account can’t be blocked. You can turn down the noise instead.',
    });
  }
  return json({ relationship: await act(user.id, target.userId, action) });
});
