import type { Redis } from 'ioredis';
import { retrySeconds, slidingEstimate, slidingRetryMs } from './sliding';
import type { RateLimiter, RateLimitResult, RateLimitRule } from './types';

// Atomic sliding-window counter (see sliding.ts). KEYS[1] is this window's counter and KEYS[2] the previous window's
// (both named here, not built in the script, as managed Redis requires). Counts the hit in this window only if the faded
// total leaves room; each counter lives for two windows. Returns { allowed (1/0), previous, current }: the counts as
// they were BEFORE this hit, so the caller can work out the retry.
const SCRIPT = `
local prev = tonumber(redis.call('GET', KEYS[2]) or '0')
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
if prev * (1 - tonumber(ARGV[2])) + cur + 1 > tonumber(ARGV[3]) then
  return { 0, prev, cur }
end
redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]) * 2)
return { 1, prev, cur }
`;

/** Redis-backed sliding-window limiter. Errors propagate: callers must fail CLOSED for auth endpoints. */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rl:',
    private readonly now: () => number = Date.now,
  ) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = this.now();
    const windowMs = rule.windowSec * 1000;
    const bucket = Math.floor(now / windowMs);
    const elapsed = (now - bucket * windowMs) / windowMs;
    const base = this.prefix + key;
    const [allowed, previous, current] = (await this.redis.eval(
      SCRIPT,
      2,
      `${base}:${bucket}`,
      `${base}:${bucket - 1}`,
      windowMs,
      elapsed,
      rule.limit,
    )) as [number, number, number];
    const estimate = slidingEstimate(previous, current, elapsed);
    if (allowed !== 1) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: retrySeconds(slidingRetryMs(previous, current, rule.limit, elapsed, windowMs)),
      };
    }
    return { allowed: true, remaining: Math.max(0, Math.floor(rule.limit - estimate - 1)), retryAfterSec: 0 };
  }
}
