import { createHash } from 'node:crypto';
import { getEnv } from '@/platform/config/env';
import { logger } from '@/platform/logger';

/**
 * Has this password appeared in a known data breach? Asked of Have I Been Pwned's range API with k-anonymity: only the
 * first 5 hex characters of the password's SHA-1 leave the server, the answer is every breached hash sharing them
 * (padded so its size says nothing), and the match happens here. The password and its full hash never leave.
 *
 * Fails OPEN: if the service is slow or down the password is allowed (it already passed our own rules). A third party
 * must never be able to stop people signing up. Security audit 2026-10-29, finding 4.
 */

export const BREACHED_PASSWORD_MESSAGE =
  'This password has appeared in a data breach, so it is easy to guess. Please choose a different one.';

type BreachCheck = (password: string) => Promise<boolean>;

export async function askPwnedPasswords(password: string): Promise<boolean> {
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const [prefix, suffix] = [hash.slice(0, 5), hash.slice(5)];
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Howdy-password-check' },
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    for (const line of (await res.text()).split('\n')) {
      const [rest, count] = line.trim().split(':');
      // Padding lines carry a count of 0: they are not real breaches.
      if (rest === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch (err) {
    logger.warn({
      event: 'auth.breach_check_unavailable',
      reason: err instanceof Error ? err.message : 'unknown',
    });
    return false;
  }
}

let override: BreachCheck | undefined;

/** For tests: replace the lookup (undefined restores the default). */
export function setBreachCheck(next: BreachCheck | undefined): void {
  override = next;
}

export function isBreachedPassword(password: string): Promise<boolean> {
  if (override) return override(password);
  // Tests never reach out to the internet unless a test installs its own check.
  if (getEnv().NODE_ENV === 'test') return Promise.resolve(false);
  return askPwnedPasswords(password);
}
