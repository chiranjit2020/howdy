import { optionalSession } from '@/modules/auth';
import { readPortrait } from '@/modules/media';
import { mayViewRanch, resolveHandle } from '@/modules/profiles';
import { AppError } from '@/platform/errors';
import { enforceRateLimit } from '@/platform/rate-limit';
import { route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

const READS = { limit: 600, windowSec: 60 } as const;

/**
 * A Portrait, for someone who may open that person's Ranch (the same rule as the Ranch page) and no one else. A missing person, a
 * hidden Ranch, a blocked pair, a signed-out visitor and "no photo" all give the SAME 404, so this cannot be used to find out who
 * exists or who has a photo.
 *
 * The response is `no-cache` (not "never cache"): the browser may keep the bytes but must ask again each time, and we answer 304
 * only AFTER re-checking access, so losing access to a Ranch stops the photo at the next request.
 */
export const GET = route(async ({ req, params }) => {
  const session = await optionalSession(req);
  if (!session) throw new AppError('NOT_FOUND');
  // Spent BEFORE looking anyone up, so counting requests cannot be used to probe handles.
  await enforceRateLimit(`media:read:${session.user.id}`, READS);

  const { handle } = await params;
  const owner = await resolveHandle(handle ?? '');
  if (!owner) throw new AppError('NOT_FOUND');
  const allowed = owner.userId === session.user.id || (await mayViewRanch(session.user.id, owner.userId));
  if (!allowed) throw new AppError('NOT_FOUND');

  const portrait = await readPortrait(owner.userId);
  if (!portrait) throw new AppError('NOT_FOUND');

  const etag = `"${portrait.version}"`;
  const headers = new Headers({
    ETag: etag,
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });

  headers.set('Content-Type', 'image/webp');
  headers.set('Content-Length', String(portrait.bytes.length));
  return new Response(new Uint8Array(portrait.bytes), { status: 200, headers });
});
