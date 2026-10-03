import { requireSession } from '@/modules/auth';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';
import { liveTokenRequest } from '@/platform/live-ping';
import { enforceRateLimit } from '@/platform/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * A signed Ably token request for the signed-in person (ADR-035): it lets this browser LISTEN to its owner's own channel,
 * and nothing else (no publishing, no other channel). 404 when instant Whispers are not set up.
 */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  // A token lasts an hour; a page asks again only when it reconnects. Generous for many tabs, useless for abuse.
  await enforceRateLimit(`live:token:${user.id}`, { limit: 60, windowSec: 3600 });
  const tokenRequest = liveTokenRequest(user.id);
  if (!tokenRequest) throw new AppError('NOT_FOUND');
  return json(tokenRequest);
});
