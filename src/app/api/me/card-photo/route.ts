import { requireSession } from '@/modules/auth';
import { completeCardPhoto, startCardPhotoUpload } from '@/modules/media';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { cardPhotoCompleteSchema, cardPhotoUploadSchema } from '@/shared/validation/media';

export const dynamic = 'force-dynamic';

/**
 * A photo for the Post Card I am about to nail (ADR-031). Like my Portrait, it always belongs to the signed-in person:
 *   POST  ask to upload (type + size)  ->  a signed URL to send the file to
 *   (the browser sends the file straight to storage)
 *   PUT   the file is there            ->  decoded, stripped of hidden data, re-encoded; ready to nail within the hour
 * Nailing the card (POST /api/porch/:handle/fence with `photoId`) is what puts it on a card.
 */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const file = await readJson(req, cardPhotoUploadSchema);
  return json(await startCardPhotoUpload(user.id, file), { status: 201 });
});

export const PUT = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const { mediaId } = await readJson(req, cardPhotoCompleteSchema);
  return json({ photo: await completeCardPhoto(user.id, mediaId) });
});
