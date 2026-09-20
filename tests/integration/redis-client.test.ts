import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import { createRedisClient } from '@/platform/redis';
import { RedisRateLimiter } from '@/platform/rate-limit';

const clients: Redis[] = [];
const make = (url: string) => {
  const c = createRedisClient(url);
  clients.push(c);
  return c;
};
afterEach(() => {
  for (const c of clients.splice(0)) c.disconnect();
});

describe('request-path Redis client', () => {
  it('the very first command on a brand-new client succeeds (cold start: no "stream not writeable" failure)', async ({
    skip,
  }) => {
    const url = process.env.REDIS_URL;
    if (!url) return skip('REDIS_URL not set');
    const limiter = new RedisRateLimiter(make(url), `test:${randomUUID()}:`);
    // Issued immediately, before the TCP connection could possibly be ready. With the offline queue disabled this threw,
    // and because the limiter fails closed, every first request after a deploy became a 500.
    const first = await limiter.consume('cold-start', { limit: 3, windowSec: 30 });
    expect(first).toMatchObject({ allowed: true, remaining: 2 });
  });

  it('when Redis is unreachable it fails within a few seconds instead of hanging the request forever', async () => {
    const limiter = new RedisRateLimiter(make('redis://127.0.0.1:1'), 'test:');
    const started = Date.now();
    await expect(limiter.consume('x', { limit: 1, windowSec: 10 })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(8_000);
  }, 15_000);
});
