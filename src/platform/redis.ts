import { Redis } from 'ioredis';
import { getEnv } from './config/env';

/**
 * Build a Redis client for request-path use (rate limiting).
 *
 * The offline queue MUST stay enabled: on a cold start the first request arrives before the TCP connection is ready,
 * and with the queue disabled that command fails immediately — which, because the rate limiter fails CLOSED, would turn
 * every first request after a deploy into a 500. Instead commands wait for the connection, but only briefly: the
 * timeouts below bound how long a request can hang when Redis is genuinely down (then the limiter fails closed).
 */
export function createRedisClient(url: string): Redis {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    connectTimeout: 2_000,
    commandTimeout: 2_000,
    // Reconnect quickly at first, then back off; never give up.
    retryStrategy: (attempt) => Math.min(attempt * 100, 2_000),
  });
  // Connection problems surface as failed commands (the limiter then fails closed), never as an unhandled 'error' event.
  redis.on('error', () => undefined);
  return redis;
}

let client: Redis | undefined;

/** Shared Redis connection, or undefined when REDIS_URL is not configured (dev/test only). */
export function getRedis(): Redis | undefined {
  const url = getEnv().REDIS_URL;
  if (!url) return undefined;
  client ??= createRedisClient(url);
  return client;
}
