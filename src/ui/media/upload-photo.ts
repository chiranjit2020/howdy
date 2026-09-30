import { portraitUploadSchema } from '@/shared/validation/media';
import { apiRequest } from '../auth/api';

interface StartedUpload {
  mediaId: string;
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
}

export type PhotoUpload = { ok: true; mediaId: string } | { ok: false; message: string };

/**
 * Send one photo the way every Howdy upload goes: ask the server (`endpoint`, POST) for a signed URL, send the file
 * straight to storage, then ask the server (`endpoint`, PUT) to finish — it decodes the bytes and keeps a clean copy.
 * The type and size checked here are only a courtesy so mistakes fail fast; the server checks again.
 */
export async function uploadPhoto(endpoint: string, file: File): Promise<PhotoUpload> {
  const checked = portraitUploadSchema.safeParse({ contentType: file.type, size: file.size });
  if (!checked.success)
    return { ok: false, message: checked.error.issues[0]?.message ?? 'We could not use that photo.' };
  const start = await apiRequest<StartedUpload>('POST', endpoint, checked.data);
  if (!start.ok || !start.data) {
    return { ok: false, message: start.error?.message ?? 'That did not work. Please try again.' };
  }
  try {
    const sent = await fetch(start.data.upload.url, {
      method: start.data.upload.method,
      headers: start.data.upload.headers,
      body: file,
    });
    if (!sent.ok) return { ok: false, message: 'The photo did not upload. Please try again.' };
  } catch {
    return { ok: false, message: 'Could not reach the photo store. Check your connection and try again.' };
  }
  const done = await apiRequest('PUT', endpoint, { mediaId: start.data.mediaId });
  if (!done.ok)
    return { ok: false, message: done.error?.fields?.file ?? done.error?.message ?? 'That did not work.' };
  return { ok: true, mediaId: start.data.mediaId };
}
