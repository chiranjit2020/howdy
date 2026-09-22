import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertObjectKey, type ObjectStore, type UploadTarget } from './types';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** The S3 endpoint of an R2 account. Also the one origin browsers are allowed to upload to (see the CSP). */
export const r2Endpoint = (accountId: string) => `https://${accountId}.r2.cloudflarestorage.com`;

/** How long a signed upload URL works. Short: the browser uses it immediately. */
const UPLOAD_TTL_SEC = 300;

const isNotFound = (err: unknown): boolean => {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
};

/**
 * Cloudflare R2 through the S3 protocol (so plain AWS S3 also works: change the endpoint). The bucket stays PRIVATE: browsers only
 * ever get a signed URL to upload, and photos are read back by this server and served through the app's own authorization.
 * Pass `client` in tests to see exactly what would be sent.
 */
export class R2ObjectStore implements ObjectStore {
  constructor(
    private readonly bucket: string,
    private readonly client: S3Client,
  ) {}

  static fromConfig(cfg: R2Config): R2ObjectStore {
    return new R2ObjectStore(
      cfg.bucket,
      new S3Client({
        region: 'auto',
        endpoint: r2Endpoint(cfg.accountId),
        forcePathStyle: true,
        credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
        // R2 does not accept the extra checksum headers newer SDK versions add by default.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    );
  }

  async createUpload(key: string, opts: { contentType: string; size: number }): Promise<UploadTarget> {
    assertObjectKey(key);
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: opts.contentType,
        ContentLength: opts.size,
      }),
      {
        expiresIn: UPLOAD_TTL_SEC,
        // Sign the type AND the length: the URL cannot be used for a different or bigger file.
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
    return { url, method: 'PUT', headers: { 'content-type': opts.contentType } };
  }

  async size(key: string): Promise<number | null> {
    assertObjectKey(key);
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? 0;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async get(key: string, maxBytes: number): Promise<Buffer | null> {
    assertObjectKey(key);
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      // Refuse before reading anything if it is bigger than we would ever process.
      if ((out.ContentLength ?? 0) > maxBytes) throw new Error('Object is larger than allowed');
      const bytes = await out.Body?.transformToByteArray();
      if (!bytes) return null;
      if (bytes.length > maxBytes) throw new Error('Object is larger than allowed');
      return Buffer.from(bytes);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertObjectKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    assertObjectKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
