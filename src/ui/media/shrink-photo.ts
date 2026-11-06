import { PORTRAIT_MAX_BYTES } from '@/shared/validation/media';

/**
 * Make a photo small enough to send, in the browser, before it is uploaded. Phone cameras now take 8-15 MB, 50-megapixel
 * pictures, but the server only keeps a small crop of them (a cover is 1600x560), so we scale the photo down to the
 * smallest size that still fills `box`, and save it as a JPEG. A 12 MB photo becomes a few hundred KB: under the 5 MB
 * limit, and quick to send on mobile data.
 *
 * This is a convenience, not a check: the server still checks the type and size and decodes the bytes itself.
 * The browser applies the phone's "rotated" flag when it draws the photo, so it is not sideways; camera and location
 * data are not copied. If the browser cannot read the photo (an unusual format, or too big for its memory), the original
 * file is returned unchanged and the usual checks decide.
 */
export async function shrinkPhoto(file: File, box: { width: number; height: number }): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return file;
    // The smallest scale that still covers the box in both directions, never enlarging.
    const scale = Math.min(1, Math.max(box.width / w, box.height / h));
    if (scale === 1 && file.size <= PORTRAIT_MAX_BYTES) return file; // already small: send as it is

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff'; // a transparent PNG would otherwise turn black as a JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]*$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
