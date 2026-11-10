import {
  VIDEO_AUDIO_BITRATE,
  VIDEO_BITRATE,
  VIDEO_KEYFRAME_SECONDS,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  VIDEO_SHORT_SIDE_PX,
  VIDEO_TYPE,
} from '@/shared/validation/media';

/**
 * Turn whatever the phone recorded into the one kind of video Howdy stores (ADR-064), on the phone itself, with the
 * browser's own video encoder (WebCodecs) through the Mediabunny library. No server does this work, so it costs nothing.
 *
 *   picture   H.264 ("avc"): the format every browser plays (iPhones record HEVC, which many Android/Windows browsers
 *             cannot). Short side 720 px, never enlarged; at most 30 frames a second; ~2 Mbps; a key frame every 2 s
 *             so jumping ahead starts quickly.
 *   sound     AAC at 96 kbps.
 *   file      MP4 with its index at the front ("fast start"), so playback begins after the first few KB.
 *   length    the first 30 seconds.
 *   poster    one frame (half a second in, past any black first frame) as a JPEG, sent like a photo.
 *
 * The library is loaded only when someone picks a video, so it costs other pages nothing.
 */

export type PreparedVideo = {
  ok: true;
  file: File;
  poster: File;
  width: number;
  height: number;
  durationMs: number;
  /** The clip was longer and only its first 30 seconds were kept. */
  trimmed: boolean;
};
export type PrepareResult = PreparedVideo | { ok: false; message: string };

const UNSUPPORTED =
  'This browser can’t prepare videos yet. Try the latest Chrome, Edge or Safari, or post a photo instead.';
const UNREADABLE = 'We couldn’t open that video. Try a different one.';
const NO_SOUND =
  'This browser can’t keep the sound of that video. Try the latest Chrome, Edge or Safari, or choose a video without sound.';

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

async function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

/** Is there any chance this browser can do it? (The real test is the encoder check inside prepareVideo.) */
export const mayPrepareVideo = (): boolean =>
  typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoDecoder' in window;

/**
 * Prepare one chosen video. `onProgress` gets 0..1 while it converts. `signal` stops it (the person removed the
 * video or left). Every failure comes back as a calm message, never a thrown error.
 */
export async function prepareVideo(
  chosen: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<PrepareResult> {
  if (!mayPrepareVideo()) return { ok: false, message: UNSUPPORTED };
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(chosen), formats: mb.ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) return { ok: false, message: UNREADABLE };
    if (!(await video.canDecode())) return { ok: false, message: UNSUPPORTED };
    const audio = await input.getPrimaryAudioTrack().catch(() => null);

    const duration = await input.computeDuration();
    if (!(duration > 0)) return { ok: false, message: UNREADABLE };
    const end = Math.min(duration, VIDEO_MAX_SECONDS);

    // 720p: the short side at most 720, never enlarged, sizes even (H.264 needs that). Display size = after rotation.
    const w = video.displayWidth;
    const h = video.displayHeight;
    const scale = Math.min(1, VIDEO_SHORT_SIDE_PX / Math.min(w, h));
    const width = even(w * scale);
    const height = even(h * scale);

    if (!(await mb.canEncodeVideo('avc', { width, height, bitrate: VIDEO_BITRATE })))
      return { ok: false, message: UNSUPPORTED };
    if (audio && !(await mb.canEncodeAudio('aac', { bitrate: VIDEO_AUDIO_BITRATE })))
      return { ok: false, message: NO_SOUND };

    // 60 fps phone clips become 30: half the frames, about half the size, and it still looks smooth on a phone.
    const fps = (await video.computePacketStats(120).catch(() => null))?.averagePacketRate ?? 30;

    // The poster first: the person sees it while the conversion runs.
    const sink = new mb.CanvasSink(video, { width, height, fit: 'contain' });
    const frame = (await sink.getCanvas(Math.min(0.5, end / 2))) ?? (await sink.getCanvas(0));
    const posterBlob = frame ? await canvasToJpeg(frame.canvas) : null;
    if (!posterBlob) return { ok: false, message: UNREADABLE };
    if (signal?.aborted) return { ok: false, message: 'Stopped.' };

    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: 'primary',
      trim: { start: 0, end },
      video: {
        codec: 'avc',
        width,
        height,
        fit: 'contain',
        quality: new mb.Quality({ bitrate: VIDEO_BITRATE }),
        keyFrameInterval: VIDEO_KEYFRAME_SECONDS,
        ...(fps > 31 ? { frameRate: 30 } : {}),
        // Turn the picture the right way up in the pixels themselves, so every player (and the poster) agrees.
        allowTransformationMetadata: false,
        forceTranscode: true,
      },
      audio: {
        codec: 'aac',
        quality: new mb.Quality({ bitrate: VIDEO_AUDIO_BITRATE }),
        ...(audio && audio.numberOfChannels > 2 ? { numberOfChannels: 2 } : {}),
        forceTranscode: true,
      },
    });
    // Sound that could not be kept is a failure, not a silent surprise after posting.
    const lost = conversion.discardedTracks.map((d) => d.track.type);
    if (!conversion.isValid || lost.includes('video')) return { ok: false, message: UNSUPPORTED };
    if (audio && lost.includes('audio')) return { ok: false, message: NO_SOUND };

    conversion.onProgress = (p) => onProgress(Math.min(1, Math.max(0, p)));
    const stop = () => void conversion.cancel();
    signal?.addEventListener('abort', stop, { once: true });
    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener('abort', stop);
    }
    const buffer = output.target.buffer;
    if (!buffer) return { ok: false, message: UNREADABLE };
    if (buffer.byteLength > VIDEO_MAX_BYTES)
      return { ok: false, message: 'That video is too big, even after shrinking. Try a shorter clip.' };
    return {
      ok: true,
      file: new File([buffer], 'video.mp4', { type: VIDEO_TYPE }),
      poster: new File([posterBlob], 'poster.jpg', { type: 'image/jpeg' }),
      width,
      height,
      durationMs: Math.round(end * 1000),
      trimmed: duration > VIDEO_MAX_SECONDS + 0.25,
    };
  } catch {
    if (signal?.aborted) return { ok: false, message: 'Stopped.' };
    return { ok: false, message: UNREADABLE };
  } finally {
    input.dispose();
  }
}
