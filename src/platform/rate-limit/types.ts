export interface RateLimitRule {
  /** Max hits allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets (only meaningful when !allowed). */
  retryAfterSec: number;
}

export interface RateLimiter {
  /** Count one hit against `key`. Implementations must be atomic. */
  consume(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
}
