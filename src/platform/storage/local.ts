import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { assertObjectKey, type ObjectStore, type UploadTarget } from './types';
import { signUploadToken, verifyUploadToken } from './upload-token';

/**
 * Files in a folder. For development and tests only (production refuses it: files on one disk do not survive a redeploy).
 * The "signed URL" points back at this app (`/api/media/local/<token>`), which is the only way bytes reach the folder.
 */
export class LocalObjectStore implements ObjectStore {
  private readonly root: string;

  constructor(
    dir: string,
    private readonly secret: string,
  ) {
    this.root = resolve(dir);
  }

  /** Absolute path for a key, refusing anything that would land outside the folder. */
  private pathFor(key: string): string {
    assertObjectKey(key);
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Invalid object key');
    return full;
  }

  async createUpload(key: string, opts: { contentType: string; size: number }): Promise<UploadTarget> {
    assertObjectKey(key);
    const token = signUploadToken(this.secret, { key, contentType: opts.contentType, size: opts.size });
    return { url: `/api/media/local/${token}`, method: 'PUT', headers: { 'content-type': opts.contentType } };
  }

  /**
   * Accept the bytes for a token. Exactly the declared size and content type, or nothing is written (the same guarantees a signed
   * S3 URL gives). Returns false for anything wrong; the caller answers with one generic error.
   */
  async acceptUpload(token: string, contentType: string | null, body: Buffer): Promise<boolean> {
    const claims = verifyUploadToken(this.secret, token);
    if (!claims) return false;
    if (contentType !== claims.contentType || body.length !== claims.size) return false;
    await this.put(claims.key, body, claims.contentType);
    return true;
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.pathFor(key))).size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async get(key: string, maxBytes: number): Promise<Buffer | null> {
    const size = await this.size(key);
    if (size === null) return null;
    if (size > maxBytes) throw new Error('Object is larger than allowed');
    return readFile(this.pathFor(key));
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
