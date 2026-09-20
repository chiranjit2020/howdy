import { after } from 'next/server';
import { logger } from './logger';

const pending = new Set<Promise<unknown>>();

/**
 * Run non-essential work (sending email) without making the response wait for it. Doing it off the request path
 * keeps response timing independent of whether an account exists (enumeration defence), and `after()` tells Next to
 * keep the process alive until it finishes. Errors are logged, never thrown into the request.
 */
export function runAfterResponse(name: string, task: () => Promise<void>): void {
  // `Promise.resolve().then` also turns a synchronous throw inside `task` into a logged rejection.
  const p: Promise<unknown> = Promise.resolve()
    .then(task)
    .catch((err: unknown) => logger.error({ event: 'background.failed', task: name, err }))
    .finally(() => pending.delete(p));
  pending.add(p);
  try {
    after(p);
  } catch {
    // Not inside a request scope (unit tests, scripts): the promise still runs.
  }
}

/** Test helper: wait for everything started with runAfterResponse. */
export async function flushBackground(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}
