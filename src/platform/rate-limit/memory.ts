import type { RateLimiter, RateLimitResult, RateLimitRule } from './types';

/** Fixed-window limiter for dev and tests. Single process only — never use in production. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = this.now();
    let w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      w = { count: 0, resetAt: now + rule.windowSec * 1000 };
      this.windows.set(key, w);
    }
    w.count += 1;
    const allowed = w.count <= rule.limit;
    return {
      allowed,
      remaining: Math.max(0, rule.limit - w.count),
      retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((w.resetAt - now) / 1000)),
    };
  }
}
