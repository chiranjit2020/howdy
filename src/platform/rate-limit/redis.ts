import type { Redis } from 'ioredis';
import type { RateLimiter, RateLimitResult, RateLimitRule } from './types';

// Atomic INCR + EXPIRE-on-first-hit. Returns { count, ttlSeconds }.
const SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return { c, ttl }
`;

/** Redis-backed fixed-window limiter. Errors propagate: callers must fail CLOSED for auth endpoints. */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rl:',
  ) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const [count, ttl] = (await this.redis.eval(SCRIPT, 1, this.prefix + key, rule.windowSec)) as [
      number,
      number,
    ];
    const allowed = count <= rule.limit;
    return {
      allowed,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSec: allowed ? 0 : Math.max(1, ttl),
    };
  }
}
