import { askPhotoFor } from '@/modules/asks';
import { optionalSession, requestContext } from '@/modules/auth';
import { readCardPhoto } from '@/modules/media';
import { AppError } from '@/platform/errors';
import { route } from '@/platform/http/route';
import { enforceRateLimit } from '@/platform/rate-limit';

export const dynamic = 'force-dynamic';

const READS = { limit: 600, windowSec: 60 } as const;

/**
 * A "Buy or wait?" question's photo (ADR-066), for exactly the people who may see the question: signed-out visitors
 * too when it is for everyone. A missing question, a hidden one and "no photo" are the same 404. `no-cache` with an
 * ETag, and 304 only after the rules are re-checked, so losing access stops the photo at the next request.
 */
export const GET = route(async ({ req, params, requestId }) => {
  const session = await optionalSession(req);
  // Spent before anything is looked up, so counting requests says nothing about which questions exist.
  await enforceRateLimit(`media:ask:${session ? session.user.id : requestContext(req, requestId).ip}`, READS);
  const viewerId = session?.user.id ?? null;
  const mediaId = await askPhotoFor(viewerId, (await params).id ?? '');
  if (!mediaId) throw new AppError('NOT_FOUND');

  // `?size=feed`: the smaller copy the list shows; the full photo opens on a tap.
  const size = new URL(req.url).searchParams.get('size') === 'feed' ? 'feed' : 'full';
  const etag = size === 'feed' ? `"${mediaId}-feed"` : `"${mediaId}"`;
  const headers = new Headers({
    ETag: etag,
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  const bytes = await readCardPhoto(mediaId, { userId: viewerId }, { size });
  if (!bytes) throw new AppError('NOT_FOUND');
  headers.set('Content-Type', 'image/webp');
  headers.set('Content-Length', String(bytes.length));
  return new Response(new Uint8Array(bytes), { status: 200, headers });
});
