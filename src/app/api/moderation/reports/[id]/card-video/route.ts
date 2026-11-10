import { requireSession } from '@/modules/auth';
import { cardVideoLink } from '@/modules/media';
import { reportedCardVideo } from '@/modules/moderation';
import { AppError } from '@/platform/errors';
import { route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/**
 * The video on a reported Post Card (ADR-064), for a moderator to play while the card is still there — held or not.
 * Moderators only. Sends the player on to a 10-minute link, like the card's own video route.
 */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const mediaId = await reportedCardVideo(user.id, (await params).id ?? '');
  if (!mediaId) throw new AppError('NOT_FOUND');
  const link = await cardVideoLink(mediaId, 'moderator');
  if (!link) throw new AppError('NOT_FOUND');
  return new Response(null, {
    status: 302,
    headers: { Location: link, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  });
});
