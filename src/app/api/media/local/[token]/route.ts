import { AppError } from '@/platform/errors';
import { getEnv } from '@/platform/config/env';
import { readBytesCapped } from '@/platform/http/body';
import { route } from '@/platform/http/route';
import { getObjectStore, LocalObjectStore } from '@/platform/storage';
import { PORTRAIT_MAX_BYTES, VIDEO_MAX_BYTES } from '@/shared/validation/media';

export const dynamic = 'force-dynamic';

/** The development store only: nothing here exists when real object storage is configured. */
function localStore(): LocalObjectStore {
  if (getEnv().STORAGE_DRIVER !== 'local') throw new AppError('NOT_FOUND');
  const store = getObjectStore();
  if (!(store instanceof LocalObjectStore)) throw new AppError('NOT_FOUND');
  return store;
}

/**
 * The development stand-in for "PUT to the bucket with a signed URL". The token in the path IS the permission: signed, short-lived,
 * and tied to one key, one content type and one exact size (anything else writes nothing). It does not exist at all when real object
 * storage is configured: production browsers upload to the bucket, never to this route.
 */
export const PUT = route(async ({ req, params }) => {
  const store = localStore();
  const { token } = await params;
  // The token fixes the exact size; this cap only stops reading early (the largest file anything uploads: a video).
  const body = await readBytesCapped(req, Math.max(PORTRAIT_MAX_BYTES, VIDEO_MAX_BYTES));
  const accepted = await store.acceptUpload(token ?? '', req.headers.get('content-type'), body);
  if (!accepted) throw new AppError('BAD_REQUEST', { message: 'That upload was not accepted.' });
  return new Response(null, { status: 204 });
});

/** Bytes per answer to an open-ended range ("bytes=100-"), like a real store sends a video in pieces. */
const CHUNK = 1024 * 1024;

/**
 * The development stand-in for "GET from the bucket with a signed URL" (videos, ADR-064), with range requests so a
 * `<video>` streams and seeks here as it does from R2. A bad or expired token is a plain 404.
 */
export const GET = route(async ({ req, params }) => {
  const store = localStore();
  const claims = store.verifyDownload((await params).token ?? '');
  if (!claims) throw new AppError('NOT_FOUND');
  const size = await store.size(claims.key);
  if (size === null) throw new AppError('NOT_FOUND');

  const headers = new Headers({
    'Content-Type': claims.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=600',
    'X-Content-Type-Options': 'nosniff',
  });
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  let start = 0;
  let end = size - 1;
  if (m && (m[1] || m[2])) {
    if (m[1]) {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), size - 1) : Math.min(start + CHUNK - 1, size - 1);
    } else {
      start = Math.max(0, size - Number(m[2])); // "bytes=-500": the last 500 bytes
    }
    if (start > end || start >= size) {
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
  }
  const bytes = await store.readRange(claims.key, start, end - start + 1);
  if (!bytes) throw new AppError('NOT_FOUND');
  headers.set('Content-Length', String(bytes.length));
  if (m) headers.set('Content-Range', `bytes ${start}-${start + bytes.length - 1}/${size}`);
  return new Response(new Uint8Array(bytes), { status: m ? 206 : 200, headers });
});
