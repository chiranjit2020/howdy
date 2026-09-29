import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalObjectStore } from '@/platform/storage/local';
import { R2ObjectStore } from '@/platform/storage/r2';
import { assertObjectKey } from '@/platform/storage/types';
import { signUploadToken, verifyUploadToken } from '@/platform/storage/upload-token';

const SECRET = 'a-long-test-secret-of-at-least-thirty-two-characters';
const CLAIMS = {
  key: 'incoming/3f2c1a9e-0000-4000-8000-000000000001',
  contentType: 'image/jpeg',
  size: 1234,
};

describe('object keys', () => {
  it('accepts the keys the server makes', () => {
    for (const ok of [
      'incoming/3f2c1a9e-0000-4000-8000-000000000001',
      'portraits/3f2c1a9e-0000-4000-8000-000000000001.webp',
    ]) {
      expect(() => assertObjectKey(ok), ok).not.toThrow();
    }
  });

  it('refuses anything that could climb out of the folder or name something surprising', () => {
    for (const bad of [
      '',
      '../secret',
      'a/../b',
      '/etc/passwd',
      'C:\\Windows\\system32',
      'incoming//x',
      'incoming/x\0y',
      'incoming/UPPER',
      'incoming/a b',
      '.hidden',
      'incoming/x.php.webp',
      `incoming/${'a'.repeat(400)}`,
    ]) {
      expect(() => assertObjectKey(bad), JSON.stringify(bad)).toThrow();
    }
  });
});

describe('upload tokens (the local driver’s signed URL)', () => {
  it('round-trips the claims', () => {
    expect(verifyUploadToken(SECRET, signUploadToken(SECRET, CLAIMS))).toEqual(CLAIMS);
  });

  it('stops working when it expires', () => {
    const t0 = 1_700_000_000_000;
    const token = signUploadToken(SECRET, CLAIMS, 300, t0);
    expect(verifyUploadToken(SECRET, token, t0 + 299_000)).toEqual(CLAIMS);
    expect(verifyUploadToken(SECRET, token, t0 + 300_000)).toBeNull();
    expect(verifyUploadToken(SECRET, token, t0 + 86_400_000)).toBeNull();
  });

  it('is rejected under another secret, when altered, or when it is not a token at all', () => {
    const token = signUploadToken(SECRET, CLAIMS);
    expect(verifyUploadToken('another-secret-another-secret-another-secret', token)).toBeNull();
    const [payload, sig] = token.split('.');
    const changed = Buffer.from(
      JSON.stringify({ ...CLAIMS, size: 999_999_999, exp: Date.now() + 1e9 }),
    ).toString('base64url');
    expect(verifyUploadToken(SECRET, `${changed}.${sig}`)).toBeNull(); // new claims, old signature
    // Change the last character to one it is not (swapping in a fixed 'A' was a no-op 1 time in 64: a flaky test).
    const last = sig!.slice(-1) === 'A' ? 'B' : 'A';
    expect(verifyUploadToken(SECRET, `${payload}.${sig!.slice(0, -1)}${last}`)).toBeNull();
    for (const junk of ['', '.', 'a.b', 'a.b.c', `${payload}`, `${payload}.`, '💥.💥']) {
      expect(verifyUploadToken(SECRET, junk), junk).toBeNull();
    }
  });
});

describe('local object store', () => {
  let dir: string;
  let store: LocalObjectStore;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'howdy-local-'));
    store = new LocalObjectStore(dir, SECRET);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('stores, reads back, measures and deletes (and deleting twice is fine)', async () => {
    const key = 'portraits/3f2c1a9e-0000-4000-8000-000000000002.webp';
    expect(await store.size(key)).toBeNull();
    expect(await store.get(key, 1000)).toBeNull();
    await store.put(key, Buffer.from('hello'), 'image/webp');
    expect(await store.size(key)).toBe(5);
    expect((await store.get(key, 1000))?.toString()).toBe('hello');
    await store.delete(key);
    await store.delete(key);
    expect(await store.size(key)).toBeNull();
  });

  it('refuses to read an object bigger than the limit', async () => {
    const key = 'incoming/3f2c1a9e-0000-4000-8000-000000000003';
    await store.put(key, Buffer.alloc(100), 'image/jpeg');
    await expect(store.get(key, 99)).rejects.toThrow(/larger/);
    expect((await store.get(key, 100))?.length).toBe(100);
  });

  it('never touches anything outside its folder', async () => {
    for (const bad of ['../x', 'a/../../x', '/tmp/x']) {
      await expect(store.put(bad, Buffer.from('x'), 'image/webp'), bad).rejects.toThrow();
      await expect(store.size(bad), bad).rejects.toThrow();
      await expect(store.delete(bad), bad).rejects.toThrow();
    }
  });

  it('accepts an upload only for the exact size and type that were signed', async () => {
    const bytes = Buffer.alloc(10, 7);
    const { url } = await store.createUpload('incoming/3f2c1a9e-0000-4000-8000-000000000004', {
      contentType: 'image/png',
      size: 10,
    });
    const token = url.split('/').pop()!;
    expect(await store.acceptUpload(token, 'image/jpeg', bytes)).toBe(false);
    expect(await store.acceptUpload(token, 'image/png', Buffer.alloc(11))).toBe(false);
    expect(await store.acceptUpload(token, 'image/png', Buffer.alloc(9))).toBe(false);
    expect(await store.acceptUpload(`${token}x`, 'image/png', bytes)).toBe(false);
    expect(await store.size('incoming/3f2c1a9e-0000-4000-8000-000000000004')).toBeNull();
    expect(await store.acceptUpload(token, 'image/png', bytes)).toBe(true);
    expect(await store.size('incoming/3f2c1a9e-0000-4000-8000-000000000004')).toBe(10);
  });
});

describe('R2 (S3 protocol) object store', () => {
  const client = new S3Client({
    region: 'auto',
    endpoint: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
    forcePathStyle: true,
    credentials: { accessKeyId: 'AKIAEXAMPLEKEY00', secretAccessKey: 'example-secret-access-key-0000' },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  it('signs an upload URL for this key, this type and this exact length, for five minutes, without leaking the secret', async () => {
    const store = new R2ObjectStore('howdy-media', client);
    const target = await store.createUpload('incoming/3f2c1a9e-0000-4000-8000-000000000005', {
      contentType: 'image/jpeg',
      size: 4321,
    });
    const url = new URL(target.url);
    expect(url.origin).toBe('https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/howdy-media/incoming/3f2c1a9e-0000-4000-8000-000000000005');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    const signed = (url.searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');
    expect(signed).toEqual(expect.arrayContaining(['content-type', 'content-length', 'host']));
    expect(target.method).toBe('PUT');
    expect(target.headers).toEqual({ 'content-type': 'image/jpeg' });
    expect(target.url).not.toContain('example-secret-access-key-0000');
  });

  it('a different size or type gives a different signature (so the URL cannot be reused for another file)', async () => {
    const store = new R2ObjectStore('howdy-media', client);
    const key = 'incoming/3f2c1a9e-0000-4000-8000-000000000006';
    const sig = async (o: { contentType: string; size: number }) =>
      new URL((await store.createUpload(key, o)).url).searchParams.get('X-Amz-Signature');
    const base = await sig({ contentType: 'image/jpeg', size: 1000 });
    expect(await sig({ contentType: 'image/jpeg', size: 1001 })).not.toBe(base);
    expect(await sig({ contentType: 'image/png', size: 1000 })).not.toBe(base);
  });

  it('reads, measures and deletes through the right commands, treats "not found" as null, and refuses oversized objects', async () => {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    let mode: 'ok' | 'missing' | 'big' = 'ok';
    const fake = {
      send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: cmd.constructor.name, input: cmd.input });
        if (mode === 'missing')
          throw Object.assign(new Error('nope'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
        if (cmd.constructor.name === 'HeadObjectCommand') return { ContentLength: 42 };
        if (cmd.constructor.name === 'GetObjectCommand')
          return {
            ContentLength: mode === 'big' ? 10_000 : 3,
            Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
          };
        return {};
      },
    } as unknown as S3Client;
    const store = new R2ObjectStore('howdy-media', fake);
    const key = 'portraits/3f2c1a9e-0000-4000-8000-000000000007.webp';

    expect(await store.size(key)).toBe(42);
    expect([...(await store.get(key, 100))!]).toEqual([1, 2, 3]);
    await store.put(key, Buffer.from('x'), 'image/webp');
    await store.delete(key);
    expect(sent.map((s) => s.name)).toEqual([
      'HeadObjectCommand',
      'GetObjectCommand',
      'PutObjectCommand',
      'DeleteObjectCommand',
    ]);
    for (const s of sent) expect(s.input).toMatchObject({ Bucket: 'howdy-media', Key: key });
    expect(sent[2]!.input.ContentType).toBe('image/webp');

    mode = 'big';
    await expect(store.get(key, 100)).rejects.toThrow(/larger/);
    mode = 'missing';
    expect(await store.size(key)).toBeNull();
    expect(await store.get(key, 100)).toBeNull();
  });

  it('checks the key before it talks to the network', async () => {
    const store = new R2ObjectStore('howdy-media', client);
    await expect(store.createUpload('../x', { contentType: 'image/jpeg', size: 1 })).rejects.toThrow();
    await expect(store.delete('a/../../b')).rejects.toThrow();
  });
});
