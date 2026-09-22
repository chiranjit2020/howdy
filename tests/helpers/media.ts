import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { DELETE as deleteRoute, POST as postRoute, PUT as putRoute } from '@/app/api/me/portrait/route';
import { PUT as putLocalRoute } from '@/app/api/media/local/[token]/route';
import { GET as getPortraitRoute } from '@/app/api/portraits/[handle]/route';
import { LocalObjectStore, setObjectStore } from '@/platform/storage';
import { call, ORIGIN, request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null; headers?: Record<string, string> };

/** A private folder standing in for the bucket. `files()` lists what is stored, as `incoming/<id>` / `portraits/<id>.webp`. */
export async function freshStore() {
  const dir = await mkdtemp(join(tmpdir(), 'howdy-media-'));
  const store = new LocalObjectStore(dir, process.env.AUTH_SECRET!);
  setObjectStore(store);
  const files = async (): Promise<string[]> => {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => relative(dir, join(e.parentPath, e.name)).replaceAll('\\', '/'))
      .sort();
  };
  const cleanup = async () => {
    setObjectStore(undefined);
    await rm(dir, { recursive: true, force: true });
  };
  return { dir, store, files, cleanup };
}

// ─── the three calls a browser makes ─────────────────────────────────────────
export const startUpload = (body: unknown, opts: Opts = {}) =>
  call(postRoute, 'POST', '/api/me/portrait', body, opts);
export const finishUpload = (mediaId: unknown, opts: Opts = {}) =>
  call(putRoute, 'PUT', '/api/me/portrait', { mediaId }, opts);
export const removeMine = (opts: Opts = {}) =>
  call(deleteRoute, 'DELETE', '/api/me/portrait', undefined, opts);

/** What the browser does with the signed URL: PUT the bytes to it. (The local driver's URL points back at this app.) */
export async function sendToStorage(
  url: string,
  bytes: Buffer,
  contentType: string | null,
  opts: { origin?: string | null } = {},
) {
  const token = url.split('/').pop()!;
  const headers: Record<string, string> = {};
  if (contentType) headers['content-type'] = contentType;
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  const res = await putLocalRoute(
    new Request(`${ORIGIN}${url}`, { method: 'PUT', headers, body: new Uint8Array(bytes) }),
    { params: Promise.resolve({ token }) },
  );
  return { status: res.status, text: await res.text() };
}

/** The whole happy path in one go: ask, send, finish. Returns each step's answer. */
export async function uploadPortrait(
  cookie: string,
  bytes: Buffer,
  contentType = 'image/jpeg',
  claimedSize = bytes.length,
) {
  const start = await startUpload({ contentType, size: claimedSize }, { cookie });
  const upload = start.data.upload as { url: string } | undefined;
  if (start.status !== 201 || !upload) return { start, sent: undefined, done: undefined };
  const sent = await sendToStorage(upload.url, bytes, contentType);
  const done = await finishUpload(start.data.mediaId, { cookie });
  return { start, sent, done };
}

/** GET /api/portraits/:handle — the picture itself. */
export async function getPortrait(handle: string, opts: Opts = {}) {
  const res = await getPortraitRoute(
    request('GET', `/api/portraits/${encodeURIComponent(handle)}`, undefined, opts),
    { params: Promise.resolve({ handle }) },
  );
  const bytes = Buffer.from(await res.arrayBuffer());
  return { res, status: res.status, bytes, text: bytes.toString('utf8') };
}

// ─── test images ─────────────────────────────────────────────────────────────
const solid = (width: number, height: number, background = '#ffb4a2') =>
  sharp({ create: { width, height, channels: 3, background } });

export const jpeg = (w = 1200, h = 800) => solid(w, h).jpeg().toBuffer();
export const png = (w = 600, h = 600) => solid(w, h, '#b7e4c7').png().toBuffer();
export const webp = (w = 600, h = 400) => solid(w, h, '#d8b4e2').webp().toBuffer();

/** A JPEG that carries a location and a copyright note, to prove they do not survive. */
export const jpegWithSecrets = () =>
  solid(800, 600)
    .withExif({
      IFD0: { Copyright: 'SECRET-COPYRIGHT-NOTE' },
      IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
    })
    .jpeg()
    .toBuffer();

/** Not photos at all, or photos of a kind we refuse. */
export const svgWithScript = () =>
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
  );
export const html = () => Buffer.from('<!doctype html><script>alert(1)</script>');
export const gif = () => solid(20, 20).gif().toBuffer();
export const tiff = () => solid(20, 20).tiff().toBuffer();
export const truncatedJpeg = async () => (await jpeg(600, 400)).subarray(0, 300);
/** Tiny on disk, enormous once decoded (over the 24-megapixel limit). */
export const pixelBomb = () => solid(5100, 5100).png({ compressionLevel: 9 }).toBuffer();

/** Metadata of an image we produced (what a browser would receive). */
export const inspect = (bytes: Buffer) => sharp(bytes).metadata();
