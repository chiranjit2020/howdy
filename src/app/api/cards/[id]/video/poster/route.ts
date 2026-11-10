import { requireSession } from '@/modules/auth';
import { cardVideoFor } from '@/modules/fence';
import { readCardVideoPoster } from '@/modules/media';
import { AppError } from '@/platform/errors';
import { enforceRateLimit } from '@/platform/rate-limit';
import { route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

const READS = { limit: 600, windowSec: 60 } as const;

/**
 * The still frame shown before a card video plays (ADR-064), by the same rules as the video. Served by the app like a
 * card photo: `no-cache` with an ETag, and 304 only after the rules are checked again.
 */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await enforceRateLimit(`media:card:${user.id}`, READS);
  const viewer = { kind: 'user', id: user.id, status: 'active' } as const;
  const mediaId = await cardVideoFor(viewer, (await params).id ?? '');
  if (!mediaId) throw new AppError('NOT_FOUND');
  const etag = `"p-${mediaId}"`;
  const headers = new Headers({
    ETag: etag,
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  const bytes = await readCardVideoPoster(mediaId, { userId: user.id });
  if (!bytes) throw new AppError('NOT_FOUND');
  headers.set('Content-Type', 'image/webp');
  headers.set('Content-Length', String(bytes.length));
  return new Response(new Uint8Array(bytes), { status: 200, headers });
});
