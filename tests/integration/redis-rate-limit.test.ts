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
    expect(blocked?.retryAfterSec).toBeLessThanOrEqual(30);
  });

  it('keeps keys independent and sets an expiry', async ({ skip }) => {
    if (!available || !redis) return skip('Redis not reachable');
    const prefix = `test:${randomUUID()}:`;
    const rl = new RedisRateLimiter(redis, prefix);
    await rl.consume('a', { limit: 1, windowSec: 30 });
    expect((await rl.consume('b', { limit: 1, windowSec: 30 })).allowed).toBe(true);
    expect(await redis.ttl(`${prefix}a`)).toBeGreaterThan(0);
  });
});
