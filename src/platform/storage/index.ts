import { getEnv } from '../config/env';
import { LocalObjectStore } from './local';
import { R2ObjectStore } from './r2';
import type { ObjectStore } from './types';

export type { ObjectStore, UploadTarget } from './types';
export { assertObjectKey, OBJECT_KEY } from './types';
export { LocalObjectStore } from './local';
export { R2ObjectStore, r2Endpoint } from './r2';
export { uploadOrigin } from './origin';
export { signUploadToken, verifyUploadToken, type UploadClaims } from './upload-token';

let store: ObjectStore | undefined;

/** The configured object store (local files, or Cloudflare R2), created on first use. */
export function getObjectStore(): ObjectStore {
  if (!store) {
    const env = getEnv();
    store =
      env.STORAGE_DRIVER === 'r2'
        ? R2ObjectStore.fromConfig({
            accountId: env.R2_ACCOUNT_ID!,
            accessKeyId: env.R2_ACCESS_KEY_ID!,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
            bucket: env.R2_BUCKET!,
          })
        : new LocalObjectStore(env.STORAGE_LOCAL_DIR, env.AUTH_SECRET);
  }
  return store;
}

/** For tests: use this store (or, with undefined, go back to the configured one). */
export function setObjectStore(next: ObjectStore | undefined): void {
  store = next;
}
