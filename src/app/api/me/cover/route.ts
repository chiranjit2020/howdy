import { requireSession } from '@/modules/auth';
import { completeCover, removeCover, startCoverUpload } from '@/modules/media';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { coverCompleteSchema, coverUploadSchema } from '@/shared/validation/media';

export const dynamic = 'force-dynamic';

/**
 * My cover photo (ADR-051), the same three steps as my Portrait and, like it, no user id anywhere: the target is always
 * the signed-in person.
 *   POST   ask to upload (type + size)  ->  a signed URL to send the file to
 *   PUT    the file is there           ->  the server decodes, crops and stores it as my cover
 *   DELETE remove it                   ->  back to my Howdy cover
 */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const file = await readJson(req, coverUploadSchema);
  return json(await startCoverUpload(user.id, file), { status: 201 });
});

export const PUT = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const { mediaId } = await readJson(req, coverCompleteSchema);
  return json({ cover: await completeCover(user.id, mediaId) });
});

export const DELETE = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ removed: await removeCover(user.id) });
});
