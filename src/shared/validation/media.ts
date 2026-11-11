import { z } from 'zod';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/**
 * Pure, browser-safe rules for Portrait (profile photo) uploads. The browser uses them to fail fast; the server re-checks
 * everything (and then decodes the actual bytes, which is the check that really matters).
 */

/** Only these are accepted. No SVG (it can carry script), no GIF/TIFF/HEIC, nothing "animated". */
export const PORTRAIT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PortraitType = (typeof PORTRAIT_TYPES)[number];

/** The largest file we accept, in bytes. Photos straight off a phone are usually 2-4 MB. */
export const PORTRAIT_MAX_BYTES = 5 * 1024 * 1024;

/** What we store and serve: a square this many pixels on a side, as WebP. */
export const PORTRAIT_SIZE_PX = 512;

export const portraitUploadSchema = z.object({
  contentType: z.enum(PORTRAIT_TYPES, { message: 'Choose a JPEG, PNG or WebP photo.' }),
  size: z
    .number({ message: 'Choose a photo.' })
    .int()
    .min(1, 'That file is empty.')
    .max(PORTRAIT_MAX_BYTES, 'Photos can be at most 5 MB.'),
});

export const portraitCompleteSchema = z.object({ mediaId: z.uuid() });

/**
 * A cover photo (ADR-051): the same accepted types and size as a Portrait, cropped from the centre to this wide banner
 * (about 3:1, a little taller than the profile's own cover box so phones and desktops both crop well), as WebP.
 */
export const COVER_WIDTH_PX = 1600;
export const COVER_HEIGHT_PX = 560;
export const coverUploadSchema = portraitUploadSchema;
export const coverCompleteSchema = portraitCompleteSchema;

/** A photo on a Post Card (ADR-031): the same accepted types and size as a Portrait, kept within this box, never enlarged. */
export const CARD_PHOTO_MAX_PX = 1280;
/** The widest a card photo is sent for the feed (a phone shows it ~370 px wide); the full one opens on a tap. */
export const FEED_PHOTO_PX = 720;
export const cardPhotoUploadSchema = portraitUploadSchema;
export const cardPhotoCompleteSchema = portraitCompleteSchema;

/**
 * A video on a Post Card (ADR-064). The phone converts every clip to this before upload (H.264 + AAC in a fast-start
 * MP4); the server reads the file's header to check it really is that, and no longer than this.
 */
export const VIDEO_TYPE = 'video/mp4';
/** Seconds. Longer clips are cut to their first 30 seconds on the phone. */
export const VIDEO_MAX_SECONDS = 30;
/** A 30 s clip at the settings below is about 6–8 MB; this leaves room for busy scenes, never a full-quality original. */
export const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
/** The short side of the converted video, in pixels (720p). Never enlarged. */
export const VIDEO_SHORT_SIDE_PX = 720;
/** The long side, at most (a 16:9 720p). Tall clips (screen recordings, 20:9) are fitted inside 720 × 1280, not cut. */
export const VIDEO_LONG_SIDE_PX = 1280;
/** Target bitrates, in bits per second: ~2 Mbps picture, 96 kbps sound. */
export const VIDEO_BITRATE = 2_000_000;
export const VIDEO_AUDIO_BITRATE = 96_000;
/** A key frame every 2 seconds, so jumping to any point starts playing quickly (the library's default is 5). */
export const VIDEO_KEYFRAME_SECONDS = 2;
/** How long a video stays up. */
export const VIDEO_LIFETIME_DAYS = 3;
/** New videos a person may post in 24 hours. */
export const VIDEOS_PER_DAY = 3;

export const cardVideoUploadSchema = z.object({
  contentType: z.literal(VIDEO_TYPE, { message: 'That video could not be prepared.' }),
  size: z
    .number({ message: 'Choose a video.' })
    .int()
    .min(1, 'That file is empty.')
    .max(VIDEO_MAX_BYTES, 'That video is too big, even after shrinking. Try a shorter clip.'),
});

/** Finishing a video: its upload, and the poster frame already sent as a card photo. */
export const cardVideoCompleteSchema = z.object({ mediaId: z.uuid(), posterId: z.uuid() });
