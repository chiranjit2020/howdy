import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisRateLimiter } from '@/platform/rate-limit';

let redis: Redis | undefined;
let available = false;

beforeAll(async () => {
  const url = process.env.REDIS_URL;
  if (!url) return;
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: () => null,
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.ping();
    redis = client;
    available = true;
  } catch {
    client.disconnect();
  }
});

afterAll(async () => {
  redis?.disconnect();
});

describe('RedisRateLimiter (needs REDIS_URL)', () => {
  it('enforces the limit atomically under concurrency', async ({ skip }) => {
    if (!available || !redis) return skip('Redis not reachable');
    const rl = new RedisRateLimiter(redis, `test:${randomUUID()}:`);
    const rule = { limit: 5, windowSec: 30 };
    const results = await Promise.all(Array.from({ length: 20 }, () => rl.consume('login:x', rule)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    const blocked = results.find((r) => !r.allowed);
    expect(blocked?.retryAfterSec).toBeGreaterThan(0);
    // Sliding window: a full window has to fade out of the count, so up to two windows.
    expect(blocked?.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('keeps keys independent and sets an expiry', async ({ skip }) => {
    if (!available || !redis) return skip('Redis not reachable');
    const prefix = `test:${randomUUID()}:`;
    const rl = new RedisRateLimiter(redis, prefix);
    await rl.consume('a', { limit: 1, windowSec: 30 });
    expect((await rl.consume('b', { limit: 1, windowSec: 30 })).allowed).toBe(true);
    const [counter] = await redis.keys(`${prefix}a:*`); // one counter per window
    expect(counter).toBeDefined();
    expect(await redis.pttl(counter!)).toBeGreaterThan(0);
  });

  it('counts the previous window too, like the in-memory limiter (no burst at the boundary)', async ({
    skip,
  }) => {
    if (!available || !redis) return skip('Redis not reachable');
    let t = 59_000;
    const rl = new RedisRateLimiter(redis, `test:${randomUUID()}:`, () => t);
    const rule = { limit: 10, windowSec: 60 };
    for (let i = 0; i < 10; i++) expect((await rl.consume('k', rule)).allowed).toBe(true);
    t = 61_000;
    expect((await rl.consume('k', rule)).allowed).toBe(false);
  });
});
