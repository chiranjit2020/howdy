import { requireSession } from '@/modules/auth';
import { readCardPhoto } from '@/modules/media';
import { reportedCardPhoto } from '@/modules/moderation';
import { AppError } from '@/platform/errors';
import { route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** The photo on a reported Post Card, for a moderator to look at while the card is still there. Moderators only. */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const mediaId = await reportedCardPhoto(user.id, (await params).id ?? '');
  if (!mediaId) throw new AppError('NOT_FOUND');
  const bytes = await readCardPhoto(mediaId);
  if (!bytes) throw new AppError('NOT_FOUND');
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
});
