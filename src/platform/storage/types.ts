/** Where the browser should send a file, and how. */
export interface UploadTarget {
  url: string;
  method: 'PUT';
  /** Headers the browser MUST send unchanged (they are part of what was signed). */
  headers: Record<string, string>;
}

/**
 * Object storage, as little of it as Howdy needs. Two drivers exist: files on disk (development and tests) and Cloudflare R2 /
 * any S3-compatible store (production). Keys are chosen by the server, never by a client.
 */
export interface ObjectStore {
  /**
   * A short-lived URL the browser can PUT exactly `size` bytes of `contentType` to. Nothing else is accepted: the type and the
   * length are part of the signature, so a signed URL cannot be reused for a bigger or different file.
   */
  createUpload(key: string, opts: { contentType: string; size: number }): Promise<UploadTarget>;
  /** Size of the stored object, or null when there is none. */
  size(key: string): Promise<number | null>;
  /** The object's bytes, or null when there is none. Throws if it is larger than `maxBytes` (never reads it in that case). */
  get(key: string, maxBytes: number): Promise<Buffer | null>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Idempotent: deleting something that is not there is not an error. */
  delete(key: string): Promise<void>;
}

/** Keys are server-made and boring: lowercase letters, digits and a few separators, no dots-and-slashes tricks. */
export const OBJECT_KEY = /^[a-z0-9][a-z0-9/_-]{0,160}(\.[a-z0-9]{1,5})?$/;

export function assertObjectKey(key: string): void {
  if (!OBJECT_KEY.test(key) || key.includes('//')) throw new Error('Invalid object key');
}
