import { requireSession } from '@/modules/auth';
import { completePortrait, removePortrait, startPortraitUpload } from '@/modules/media';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { portraitCompleteSchema, portraitUploadSchema } from '@/shared/validation/media';

export const dynamic = 'force-dynamic';

/**
 * My Portrait. There is deliberately no user id anywhere in these requests: the target is always the signed-in person, so nobody can
 * even address someone else's photo. The flow is three calls:
 *   POST   ask to upload (type + size)  ->  a signed URL to send the file to
 *   (the browser sends the file straight to storage)
 *   PUT    the file is there           ->  the server decodes, crops and stores it as my Portrait
 *   DELETE remove it                   ->  back to the initials avatar
 */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const file = await readJson(req, portraitUploadSchema);
  return json(await startPortraitUpload(user.id, file), { status: 201 });
});

export const PUT = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const { mediaId } = await readJson(req, portraitCompleteSchema);
  return json({ portrait: await completePortrait(user.id, mediaId) });
});

export const DELETE = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ removed: await removePortrait(user.id) });
});
