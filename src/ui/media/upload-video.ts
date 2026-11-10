import { cardVideoUploadSchema } from '@/shared/validation/media';
import { apiRequest } from '../auth/api';
import { prepareVideo } from './prepare-video';
import { uploadPhoto } from './upload-photo';

interface StartedUpload {
  mediaId: string;
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
}

/** Where a video is on its way (shown under the preview). */
export type VideoStage =
  { step: 'preparing'; fraction: number } | { step: 'uploading' } | { step: 'checking' };

export type VideoUpload =
  | { ok: true; mediaId: string; trimmed: boolean; poster: File; width: number; height: number }
  | { ok: false; message: string };

/**
 * Send one video the Howdy way (ADR-064):
 *   1. prepare it on the phone (prepare-video.ts): a small H.264 MP4 and a poster frame
 *   2. send the poster like any card photo (it is re-encoded and goes through the photo check)
 *   3. ask for a signed URL, send the MP4 straight to storage
 *   4. ask the server to finish: it checks the file's header and keeps the video for 3 days
 * `onStage` follows along; `signal` stops it.
 */
export async function uploadVideo(
  chosen: File,
  onStage: (s: VideoStage) => void,
  signal?: AbortSignal,
): Promise<VideoUpload> {
  onStage({ step: 'preparing', fraction: 0 });
  const prepared = await prepareVideo(chosen, (fraction) => onStage({ step: 'preparing', fraction }), signal);
  if (!prepared.ok) return prepared;
  if (signal?.aborted) return { ok: false, message: 'Stopped.' };

  onStage({ step: 'uploading' });
  const poster = await uploadPhoto('/api/me/card-photo', prepared.poster);
  if (!poster.ok) return { ok: false, message: poster.message };

  const checked = cardVideoUploadSchema.safeParse({
    contentType: prepared.file.type,
    size: prepared.file.size,
  });
  if (!checked.success)
    return { ok: false, message: checked.error.issues[0]?.message ?? 'We could not use that video.' };
  const start = await apiRequest<StartedUpload>('POST', '/api/me/card-video', checked.data);
  if (!start.ok || !start.data)
    return { ok: false, message: start.error?.message ?? 'That did not work. Please try again.' };
  try {
    const sent = await fetch(start.data.upload.url, {
      method: start.data.upload.method,
      headers: start.data.upload.headers,
      body: prepared.file,
      ...(signal ? { signal } : {}),
    });
    if (!sent.ok) return { ok: false, message: 'The video did not upload. Please try again.' };
  } catch {
    if (signal?.aborted) return { ok: false, message: 'Stopped.' };
    return { ok: false, message: 'Could not reach the video store. Check your connection and try again.' };
  }

  onStage({ step: 'checking' });
  const done = await apiRequest('PUT', '/api/me/card-video', {
    mediaId: start.data.mediaId,
    posterId: poster.mediaId,
  });
  if (!done.ok)
    return { ok: false, message: done.error?.fields?.file ?? done.error?.message ?? 'That did not work.' };
  return {
    ok: true,
    mediaId: start.data.mediaId,
    trimmed: prepared.trimmed,
    poster: prepared.poster,
    width: prepared.width,
    height: prepared.height,
  };
}
