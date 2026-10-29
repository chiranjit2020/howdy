import { afterEach, describe, expect, it } from 'vitest';
import { AppError } from '@/platform/errors';
import { enforceRateLimit, MemoryRateLimiter, setRateLimiter, type RateLimiter } from '@/platform/rate-limit';

afterEach(() => setRateLimiter(undefined));

describe('MemoryRateLimiter', () => {
  it('allows up to the limit, then blocks with a retry hint', async () => {
    const t = 1_000_000;
    const rl = new MemoryRateLimiter(() => t);
    const rule = { limit: 3, windowSec: 60 };
    expect((await rl.consume('k', rule)).allowed).toBe(true);
    expect((await rl.consume('k', rule)).allowed).toBe(true);
    const third = await rl.consume('k', rule);
    expect(third).toMatchObject({ allowed: true, remaining: 0 });
    const fourth = await rl.consume('k', rule);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSec).toBeGreaterThan(0);
  });

  it('frees up once the burst has slid out of the window, and isolates keys', async () => {
    let t = 0;
    const rl = new MemoryRateLimiter(() => t);
    const rule = { limit: 1, windowSec: 10 };
    await rl.consume('a', rule);
    expect((await rl.consume('a', rule)).allowed).toBe(false);
    expect((await rl.consume('b', rule)).allowed).toBe(true);
    t += 20_001; // two windows on: nothing of the old burst still counts
    expect((await rl.consume('a', rule)).allowed).toBe(true);
  });

  it('a full allowance just before the window turns over is NOT followed by another just after (sliding window)', async () => {
    let t = 59_000; // one second before a 60 s window ends
    const rl = new MemoryRateLimiter(() => t);
    const rule = { limit: 10, windowSec: 60 };
    for (let i = 0; i < 10; i++) expect((await rl.consume('k', rule)).allowed).toBe(true);
    t = 61_000; // one second into the next window: a fixed window would allow 10 more here
    const next = await rl.consume('k', rule);
    expect(next.allowed).toBe(false);
    expect(next.retryAfterSec).toBeGreaterThan(0);
    // Half-way through the next window, half of the old burst has faded: about half an allowance is back.
    t = 90_000;
    let allowed = 0;
    for (let i = 0; i < 10; i++) if ((await rl.consume('k', rule)).allowed) allowed += 1;
    expect(allowed).toBeGreaterThanOrEqual(4);
    expect(allowed).toBeLessThanOrEqual(5);
  });

  it('says honestly how long to wait', async () => {
    let t = 0;
    const rl = new MemoryRateLimiter(() => t);
    const rule = { limit: 2, windowSec: 10 };
    await rl.consume('k', rule);
    await rl.consume('k', rule);
    const blocked = await rl.consume('k', rule);
    t += blocked.retryAfterSec * 1000;
    expect((await rl.consume('k', rule)).allowed).toBe(true);
  });
});

describe('enforceRateLimit', () => {
  it('throws RATE_LIMITED when over the limit', async () => {
    setRateLimiter(new MemoryRateLimiter());
    const rule = { limit: 1, windowSec: 60 };
    await enforceRateLimit('login:1.2.3.4', rule);
    await expect(enforceRateLimit('login:1.2.3.4', rule)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('fails CLOSED when the limiter backend errors', async () => {
    const broken: RateLimiter = {
      consume: async () => {
        throw new Error('ECONNREFUSED');
      },
    };
    setRateLimiter(broken);
    const err = await enforceRateLimit('k', { limit: 5, windowSec: 60 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('INTERNAL');
  });
});
