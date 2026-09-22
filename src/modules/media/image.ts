import sharp from 'sharp';
import { AppError } from '@/platform/errors';
import { PORTRAIT_SIZE_PX } from '@/shared/validation/media';

/** The most pixels we will even try to decode (a 24-megapixel photo). A "pixel bomb" is small on disk and huge in memory. */
export const MAX_INPUT_PIXELS = 24_000_000;

/** Formats we accept once the BYTES have been looked at (the client's claimed type is never trusted). */
const ACCEPTED = new Set(['jpeg', 'png', 'webp']);

const UNUSABLE = () =>
  new AppError('VALIDATION_FAILED', {
    message: 'We could not use that photo. Try a different JPEG, PNG or WebP.',
    fields: { file: 'We could not use that photo. Try a different JPEG, PNG or WebP.' },
  });

export interface ProcessedPortrait {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Turn an uploaded photo into the one thing we ever serve: a square WebP, {PORTRAIT_SIZE_PX} px on a side.
 * Decoding and re-encoding is the security control here, more than the resizing: whatever the file claimed to be (or hid: script
 * in an SVG, a polyglot, trailing bytes), only pixels survive. Location and camera data (EXIF) are dropped, and a phone's
 * "rotated" flag is applied first so the photo is not sideways. Animated files keep their first frame only.
 * Any failure (not an image, unsupported format, too many pixels, corrupt) is one generic error.
 */
export async function processPortrait(input: Buffer): Promise<ProcessedPortrait> {
  try {
    const base = () => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', animated: false });
    const meta = await base().metadata();
    if (!meta.format || !ACCEPTED.has(meta.format)) throw UNUSABLE();
    if (!meta.width || !meta.height) throw UNUSABLE();

    const { data, info } = await base()
      .rotate() // apply the EXIF orientation, then no metadata is kept
      .resize(PORTRAIT_SIZE_PX, PORTRAIT_SIZE_PX, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw UNUSABLE();
  }
}
