import { AppError } from '@/platform/errors';
import { getEnv } from '@/platform/config/env';
import { readBytesCapped } from '@/platform/http/body';
import { route } from '@/platform/http/route';
import { getObjectStore, LocalObjectStore } from '@/platform/storage';
import { PORTRAIT_MAX_BYTES } from '@/shared/validation/media';

export const dynamic = 'force-dynamic';

/**
 * The development stand-in for "PUT to the bucket with a signed URL". The token in the path IS the permission: signed, short-lived,
 * and tied to one key, one content type and one exact size (anything else writes nothing). It does not exist at all when real object
 * storage is configured: production browsers upload to the bucket, never to this route.
 */
export const PUT = route(async ({ req, params }) => {
  if (getEnv().STORAGE_DRIVER !== 'local') throw new AppError('NOT_FOUND');
  const store = getObjectStore();
  if (!(store instanceof LocalObjectStore)) throw new AppError('NOT_FOUND');

  const { token } = await params;
  const body = await readBytesCapped(req, PORTRAIT_MAX_BYTES);
  const accepted = await store.acceptUpload(token ?? '', req.headers.get('content-type'), body);
  if (!accepted) throw new AppError('BAD_REQUEST', { message: 'That upload was not accepted.' });
  return new Response(null, { status: 204 });
});
