import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MAX_INPUT_PIXELS, processPortrait } from '@/modules/media';

const RED = { r: 230, g: 30, b: 30 };
const BLUE = { r: 30, g: 30, b: 230 };

/** Left half red, right half blue. */
async function halves(width: number, height: number, orientation?: number) {
  const left = await sharp({ create: { width: width / 2, height, channels: 3, background: RED } })
    .png()
    .toBuffer();
  const right = await sharp({ create: { width: width / 2, height, channels: 3, background: BLUE } })
    .png()
    .toBuffer();
  const img = sharp({ create: { width, height, channels: 3, background: RED } }).composite([
    { input: left, left: 0, top: 0 },
    { input: right, left: width / 2, top: 0 },
  ]);
  return (orientation ? img.withMetadata({ orientation }) : img).jpeg({ quality: 95 }).toBuffer();
}

/** The colour at (x, y) of a processed portrait. */
async function pixel(data: Buffer, x: number, y: number) {
  const { data: raw, info } = await sharp(data).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: raw[i]!, g: raw[i + 1]!, b: raw[i + 2]! };
}
const isRed = (p: { r: number; b: number }) => p.r > 150 && p.b < 100;
const isBlue = (p: { r: number; b: number }) => p.b > 150 && p.r < 100;

describe('processPortrait', () => {
  it('always produces a 512x512 WebP, whatever the shape or size of the photo', async () => {
    for (const [w, h] of [
      [1200, 800],
      [800, 1200],
      [512, 512],
      [64, 64],
      [3000, 200],
      [200, 3000],
    ] as const) {
      const out = await processPortrait(await halves(w % 2 ? w + 1 : w, h));
      const meta = await sharp(out.data).metadata();
      expect([meta.format, meta.width, meta.height], `${w}x${h}`).toEqual(['webp', 512, 512]);
      expect([out.width, out.height]).toEqual([512, 512]);
    }
  });

  it('crops to the centre instead of squashing (a wide photo loses its sides, not its proportions)', async () => {
    // A 1200x400 photo that is red on the left third and blue on the right third, green in the middle third.
    const third = async (color: { r: number; g: number; b: number }) =>
      sharp({ create: { width: 400, height: 400, channels: 3, background: color } })
        .png()
        .toBuffer();
    const wide = await sharp({ create: { width: 1200, height: 400, channels: 3, background: '#000' } })
      .composite([
        { input: await third(RED), left: 0, top: 0 },
        { input: await third({ r: 30, g: 200, b: 30 }), left: 400, top: 0 },
        { input: await third(BLUE), left: 800, top: 0 },
      ])
      .png()
      .toBuffer();
    const { data } = await processPortrait(wide);
    const centre = await pixel(data, 256, 256);
    expect(centre.g).toBeGreaterThan(150); // the middle third fills the square
    expect(isRed(await pixel(data, 4, 256))).toBe(false); // the outer thirds were cropped away
    expect(isBlue(await pixel(data, 507, 256))).toBe(false);
  });

  it('applies a phone’s “rotated” flag, so the photo is not sideways', async () => {
    // EXIF orientation 6 = "rotate 90° clockwise to display". The left (red) half must end up on TOP.
    const { data } = await processPortrait(await halves(400, 200, 6));
    expect(isRed(await pixel(data, 256, 20))).toBe(true);
    expect(isBlue(await pixel(data, 256, 490))).toBe(true);
    // ...and without the flag the halves stay left/right.
    const upright = await processPortrait(await halves(400, 200));
    expect(isRed(await pixel(upright.data, 20, 256))).toBe(true);
    expect(isBlue(await pixel(upright.data, 490, 256))).toBe(true);
  });

  it('keeps nothing but pixels: no EXIF, no location, no copyright note', async () => {
    const photo = await sharp({ create: { width: 300, height: 300, channels: 3, background: RED } })
      .withExif({ IFD0: { Copyright: 'SECRET-COPYRIGHT-NOTE' }, IFD3: { GPSLatitudeRef: 'N' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const { data } = await processPortrait(photo);
    expect((await sharp(data).metadata()).exif).toBeUndefined();
    expect(data.includes(Buffer.from('SECRET-COPYRIGHT-NOTE'))).toBe(false);
  });

  it('accepts JPEG, PNG and WebP', async () => {
    const base = () => sharp({ create: { width: 200, height: 200, channels: 3, background: RED } });
    for (const make of [
      () => base().jpeg().toBuffer(),
      () => base().png().toBuffer(),
      () => base().webp().toBuffer(),
    ]) {
      await expect(processPortrait(await make())).resolves.toMatchObject({ width: 512, height: 512 });
    }
  });

  it('refuses everything else with one generic error: other formats, junk, empty, truncated, oversized in pixels', async () => {
    const base = () => sharp({ create: { width: 200, height: 200, channels: 3, background: RED } });
    const jpg = await base().jpeg().toBuffer();
    const bad: [string, Buffer][] = [
      ['gif', await base().gif().toBuffer()],
      ['tiff', await base().tiff().toBuffer()],
      [
        'svg',
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
        ),
      ],
      ['html', Buffer.from('<!doctype html><script>alert(1)</script>')],
      ['text', Buffer.from('hello')],
      ['empty', Buffer.alloc(0)],
      ['truncated', jpg.subarray(0, 60)],
      ['random bytes', Buffer.from(Array.from({ length: 500 }, (_, i) => (i * 37) % 251))],
    ];
    const messages = new Set<string>();
    for (const [name, bytes] of bad) {
      try {
        await processPortrait(bytes);
        expect.unreachable(`${name} should have been refused`);
      } catch (e) {
        expect((e as { code?: string }).code, name).toBe('VALIDATION_FAILED');
        messages.add((e as Error).message);
      }
    }
    expect(messages.size).toBe(1);
  });

  it('refuses a picture with more pixels than the limit (it would be small on disk and huge in memory)', async () => {
    const side = Math.ceil(Math.sqrt(MAX_INPUT_PIXELS)) + 50;
    const bomb = await sharp({ create: { width: side, height: side, channels: 3, background: RED } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024);
    await expect(processPortrait(bomb)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
