import { cardVideoUploadSchema } from '@/shared/validation/media';
import { apiRequest } from '../auth/api';
import { prepareVideo } from './prepare-video';
import { uploadPhoto } from './upload-photo';

interface StartedUpload {
  mediaId: string;
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
}

/** Where a video is on its way. */
export type VideoStage =
  { step: 'preparing'; fraction: number } | { step: 'uploading'; fraction: number } | { step: 'checking' };

/** One number for the whole job, 0–99 (100 is "Ready"): shrinking 0–60, sending 60–95, the server's check 95–99. */
export function videoPercent(s: VideoStage): number {
  if (s.step === 'preparing') return Math.round(s.fraction * 60);
  if (s.step === 'uploading') return 60 + Math.round(s.fraction * 35);
  return 99;
}

/** PUT with upload progress (fetch cannot report it). Resolves with the HTTP status, 0 when the network failed. */
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onFraction: (f: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onFraction(e.loaded / e.total);
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve(0);
    xhr.onabort = () => resolve(0);
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

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

  onStage({ step: 'uploading', fraction: 0 });
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
  const status = await putWithProgress(
    start.data.upload.url,
    start.data.upload.headers,
    prepared.file,
    (fraction) => onStage({ step: 'uploading', fraction }),
    signal,
  );
  if (signal?.aborted) return { ok: false, message: 'Stopped.' };
  if (status === 0)
    return { ok: false, message: 'Could not reach the video store. Check your connection and try again.' };
  if (status < 200 || status >= 300)
    return { ok: false, message: 'The video did not upload. Please try again.' };

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
