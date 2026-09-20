import { getRedis } from '../redis';
import { MemoryRateLimiter } from './memory';
import { RedisRateLimiter } from './redis';
import type { RateLimiter, RateLimitRule } from './types';
import { AppError } from '../errors';

export type { RateLimiter, RateLimitResult, RateLimitRule } from './types';
export { MemoryRateLimiter } from './memory';
export { RedisRateLimiter } from './redis';

let limiter: RateLimiter | undefined;

export function getRateLimiter(): RateLimiter {
  if (!limiter) {
    const redis = getRedis();
    limiter = redis ? new RedisRateLimiter(redis) : new MemoryRateLimiter();
  }
  return limiter;
}

/** For tests. */
export function setRateLimiter(next: RateLimiter | undefined): void {
  limiter = next;
}

/**
 * Enforce a rule or throw RATE_LIMITED. Fails CLOSED: if the limiter backend errors, the request is
 * rejected rather than allowed through (abuse protection must not silently disappear).
 */
export async function enforceRateLimit(key: string, rule: RateLimitRule): Promise<void> {
  let result;
  try {
    result = await getRateLimiter().consume(key, rule);
  } catch (cause) {
    throw new AppError('INTERNAL', { cause });
  }
  if (!result.allowed) throw new AppError('RATE_LIMITED', { retryAfterSec: result.retryAfterSec });
}
