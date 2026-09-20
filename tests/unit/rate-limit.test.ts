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

  it('resets after the window and isolates keys', async () => {
    let t = 0;
    const rl = new MemoryRateLimiter(() => t);
    const rule = { limit: 1, windowSec: 10 };
    await rl.consume('a', rule);
    expect((await rl.consume('a', rule)).allowed).toBe(false);
    expect((await rl.consume('b', rule)).allowed).toBe(true);
    t += 10_001;
    expect((await rl.consume('a', rule)).allowed).toBe(true);
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
