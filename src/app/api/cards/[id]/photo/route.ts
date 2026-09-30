import { optionalSession, requestContext } from '@/modules/auth';
import { cardPhotoFor } from '@/modules/fence';
import { readCardPhoto } from '@/modules/media';
import { AppError } from '@/platform/errors';
import { enforceRateLimit } from '@/platform/rate-limit';
import { route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

const READS = { limit: 600, windowSec: 60 } as const;

/**
 * A Post Card's photo (ADR-031), for exactly the people who may see that card — signed-out visitors too where the
 * Fence is open to everyone. A missing card, a hidden one and "no photo" are the same 404. `no-cache` with an ETag:
 * the browser may keep the bytes but asks again each time, and 304 is answered only AFTER the rules are re-checked, so
 * losing access stops the photo at the next request.
 */
export const GET = route(async ({ req, params, requestId }) => {
  const session = await optionalSession(req);
  // Spent before anything is looked up, so counting requests says nothing about which cards exist.
  await enforceRateLimit(
    `media:card:${session ? session.user.id : requestContext(req, requestId).ip}`,
    READS,
  );
  const viewer = session
    ? ({ kind: 'user', id: session.user.id, status: 'active' } as const)
    : ({ kind: 'anonymous' } as const);
  const mediaId = await cardPhotoFor(viewer, (await params).id ?? '');
  if (!mediaId) throw new AppError('NOT_FOUND');

  const etag = `"${mediaId}"`;
  const headers = new Headers({
    ETag: etag,
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  const bytes = await readCardPhoto(mediaId);
  if (!bytes) throw new AppError('NOT_FOUND');
  headers.set('Content-Type', 'image/webp');
  headers.set('Content-Length', String(bytes.length));
  return new Response(new Uint8Array(bytes), { status: 200, headers });
});
