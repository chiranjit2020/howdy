import { describe, expect, it } from 'vitest';
import { readBytesCapped } from '@/platform/http/body';

/** A request whose body is produced chunk by chunk, counting how many chunks were actually pulled. */
function streamed(chunks: number, chunkBytes: number, headers: Record<string, string> = {}) {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunks) return controller.close();
      pulled++;
      controller.enqueue(new Uint8Array(chunkBytes).fill(1));
    },
  });
  const req = new Request('http://localhost/x', {
    method: 'PUT',
    body,
    headers,
    duplex: 'half',
  } as RequestInit);
  return { req, pulls: () => pulled };
}

describe('readBytesCapped', () => {
  it('returns the whole body when it fits', async () => {
    const { req } = streamed(3, 100);
    expect((await readBytesCapped(req, 300)).length).toBe(300);
    expect((await readBytesCapped(new Request('http://localhost/x', { method: 'PUT' }), 10)).length).toBe(0);
  });

  it('stops reading the moment the body goes over, instead of buffering it all (an endless upload cannot fill memory)', async () => {
    const { req, pulls } = streamed(1_000_000, 1000); // a gigabyte if anyone read it all
    await expect(readBytesCapped(req, 2500)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(pulls()).toBeLessThan(10); // it gave up after a few chunks
  });

  it('refuses at once when the declared length is already too big, without reading anything', async () => {
    const { req, pulls } = streamed(5, 1000, { 'content-length': '999999' });
    await expect(readBytesCapped(req, 2500)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(pulls()).toBeLessThanOrEqual(1); // a stream prefetches one chunk by itself; we never read on from there
  });

  it('does not trust a length header that lies (small header, big body)', async () => {
    const { req } = streamed(50, 1000, { 'content-length': '10' });
    await expect(readBytesCapped(req, 2500)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
