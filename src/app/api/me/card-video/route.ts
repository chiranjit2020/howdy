import { requireSession } from '@/modules/auth';
import { completeCardVideo, startCardVideoUpload } from '@/modules/media';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { cardVideoCompleteSchema, cardVideoUploadSchema } from '@/shared/validation/media';

export const dynamic = 'force-dynamic';

/**
 * A video for the post I am about to write (ADR-064). The page has already converted it on the phone (H.264 + AAC MP4,
 * 720p, fast start) and sent its poster frame as a card photo (POST/PUT /api/me/card-photo):
 *   POST  ask to upload (type + size)   ->  a signed URL to send the file to
 *   (the browser sends the file straight to storage)
 *   PUT   { mediaId, posterId }         ->  size and MP4 header checked; ready to post for 3 days
 * Posting (POST /api/porch/:handle/fence with `videoId`) is what puts it on a card.
 */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const file = await readJson(req, cardVideoUploadSchema);
  return json(await startCardVideoUpload(user.id, file), { status: 201 });
});

export const PUT = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const { mediaId, posterId } = await readJson(req, cardVideoCompleteSchema);
  return json({ video: await completeCardVideo(user.id, mediaId, posterId) });
});
