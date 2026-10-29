import { retrySeconds, slidingEstimate, slidingRetryMs } from './sliding';
import type { RateLimiter, RateLimitResult, RateLimitRule } from './types';

/** Sliding-window limiter for dev and tests (same counting as the Redis one). Single process only — never in production. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { bucket: number; count: number; previous: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = this.now();
    const windowMs = rule.windowSec * 1000;
    const bucket = Math.floor(now / windowMs);
    let w = this.windows.get(key);
    if (!w) w = { bucket, count: 0, previous: 0 };
    else if (w.bucket !== bucket) {
      // A new window: the old one becomes "previous" only if it was the one right before.
      w = { bucket, count: 0, previous: w.bucket === bucket - 1 ? w.count : 0 };
    }
    this.windows.set(key, w);
    const elapsed = (now - bucket * windowMs) / windowMs;
    const estimate = slidingEstimate(w.previous, w.count, elapsed);
    if (estimate + 1 > rule.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: retrySeconds(slidingRetryMs(w.previous, w.count, rule.limit, elapsed, windowMs)),
      };
    }
    w.count += 1;
    return { allowed: true, remaining: Math.max(0, Math.floor(rule.limit - estimate - 1)), retryAfterSec: 0 };
  }
}
