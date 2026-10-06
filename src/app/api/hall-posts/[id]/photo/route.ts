import { requireSession } from '@/modules/auth';
import { readCardPhoto } from '@/modules/media';
import { hallPostPhotoFor } from '@/modules/town-halls';
import { AppError } from '@/platform/errors';
import { route } from '@/platform/http/route';
import { enforceRateLimit } from '@/platform/rate-limit';

export const dynamic = 'force-dynamic';

const READS = { limit: 600, windowSec: 60 } as const;

/**
 * A Town Hall post's photo (ADR-046), for exactly the members who may see that post. A missing post, a hidden one and
 * "no photo" are the same 404. `no-cache` with an ETag, and 304 only after the rules are re-checked, so leaving the Town
 * Hall (or being banned) stops the photo at the next request.
 */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  // Spent before anything is looked up, so counting requests says nothing about which posts exist.
  await enforceRateLimit(`media:hall:${user.id}`, READS);
  const mediaId = await hallPostPhotoFor(user.id, (await params).id ?? '');
  if (!mediaId) throw new AppError('NOT_FOUND');

  const etag = `"${mediaId}"`;
  const headers = new Headers({
    ETag: etag,
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  const bytes = await readCardPhoto(mediaId, { userId: user.id });
  if (!bytes) throw new AppError('NOT_FOUND');
  headers.set('Content-Type', 'image/webp');
  headers.set('Content-Length', String(bytes.length));
  return new Response(new Uint8Array(bytes), { status: 200, headers });
});
