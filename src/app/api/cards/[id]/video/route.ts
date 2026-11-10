import { requireSession } from '@/modules/auth';
import { cardVideoFor } from '@/modules/fence';
import { cardVideoLink } from '@/modules/media';
import { AppError } from '@/platform/errors';
import { enforceRateLimit } from '@/platform/rate-limit';
import { route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Each tap on play is one; a person scrolling a feed of videos stays far below this. */
const READS = { limit: 120, windowSec: 60 } as const;

/**
 * Watch a Post Card's video (ADR-064): the card's rules are checked now, then the browser is sent on to a link that
 * works for 10 minutes and streams straight from storage (with range requests, so it starts at once and can jump).
 * Signed-in friends only: a video lives only on friends-only walls. A missing card, a hidden one, an expired video and
 * "no video" are the same 404. Never cached: the next play checks the rules again.
 */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await enforceRateLimit(`media:video:${user.id}`, READS);
  const viewer = { kind: 'user', id: user.id, status: 'active' } as const;
  const mediaId = await cardVideoFor(viewer, (await params).id ?? '');
  if (!mediaId) throw new AppError('NOT_FOUND');
  const link = await cardVideoLink(mediaId, { userId: user.id });
  if (!link) throw new AppError('NOT_FOUND');
  return new Response(null, {
    status: 302,
    headers: {
      Location: link,
      'Cache-Control': 'private, no-store',
      // The signed link must not leak onward in a Referer.
      'Referrer-Policy': 'no-referrer',
    },
  });
});
