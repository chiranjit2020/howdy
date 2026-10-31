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
export const cardPhotoUploadSchema = portraitUploadSchema;
export const cardPhotoCompleteSchema = portraitCompleteSchema;
