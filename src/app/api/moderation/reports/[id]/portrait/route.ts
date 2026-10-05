import { requireSession } from '@/modules/auth';
import { readPortrait } from '@/modules/media';
import { reportedPortrait } from '@/modules/moderation';
import { AppError } from '@/platform/errors';
import { route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/**
 * The photo a report is about, for a moderator to look at. Only the exact version that was reported: if its owner has
 * since replaced or removed it, this is a 404 (there is nothing left to judge). Moderators only; 404 to anyone else.
 * Never cached.
 */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const reported = await reportedPortrait(user.id, (await params).id ?? '');
  if (!reported) throw new AppError('NOT_FOUND');
  const portrait = await readPortrait(reported.ownerId, 'moderator');
  if (!portrait || portrait.version !== reported.mediaId) throw new AppError('NOT_FOUND');
  return new Response(new Uint8Array(portrait.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(portrait.bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
});
