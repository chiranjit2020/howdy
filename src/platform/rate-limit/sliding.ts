/**
 * The sliding-window counter shared by both limiters. A fixed window lets a full allowance be spent just before the
 * window ends and another just after (twice the limit in a moment); counting the previous window too, faded by how much
 * of it has passed, closes that gap with only two counters per key. (Security audit 2026-10-29, finding 8.)
 */

/** How many hits the window holds right now: the previous window's count, faded, plus this one's. */
export function slidingEstimate(previous: number, current: number, elapsedFraction: number): number {
  return previous * (1 - elapsedFraction) + current;
}

/**
 * Milliseconds until one more hit would be allowed, when it is not now. Either the previous window fades out far
 * enough during this one, or (when this window alone is full) this window has to become the previous one and fade.
 */
export function slidingRetryMs(
  previous: number,
  current: number,
  limit: number,
  elapsedFraction: number,
  windowMs: number,
): number {
  const room = limit - 1; // the estimate must fall to this for one more hit to fit
  if (current <= room) {
    const at = previous > 0 ? 1 - (room - current) / previous : 0;
    return Math.max(0, at - elapsedFraction) * windowMs;
  }
  const at = current > 0 ? 1 - room / current : 0;
  return (1 - elapsedFraction) * windowMs + at * windowMs;
}

export const retrySeconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));
