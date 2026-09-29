import { getEnv } from '@/platform/config/env';
import type { RateLimitRule } from '@/platform/rate-limit';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const SESSION_IDLE_MS = 14 * DAY;
export const SESSION_ABSOLUTE_MS = 60 * DAY;
/** last_seen / idle expiry are refreshed at most this often, so a busy user does not cause a write per request. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * MIN;

export const VERIFY_EMAIL_TTL_MS = 24 * HOUR;
export const RESET_PASSWORD_TTL_MS = HOUR;

/**
 * Rate limits. Every sensitive action is limited per source (IP) AND per target (account/email) so that neither
 * one client hammering many accounts nor many clients hammering one account gets through. The per-target limit means
 * a determined attacker can temporarily throttle a victim's login; that trade-off is accepted (throttle, not lockout).
 */
const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
export const RATE = {
  signupIp: rule(10, 3600),
  signupEmail: rule(5, 3600),
  loginIp: rule(30, 900),
  loginIdentifier: rule(10, 900),
  forgotIp: rule(10, 3600),
  forgotEmail: rule(3, 3600),
  resendIp: rule(10, 3600),
  resendEmail: rule(3, 3600),
  tokenIp: rule(20, 3600),
  /** Asking to delete my account (it re-checks the password, so it is limited like a sign-in). */
  deleteAccount: rule(5, 3600),
} as const;

/** Cookie name. The `__Host-` prefix (Secure, Path=/, no Domain) is used whenever the site is served over https. */
export function sessionCookieName(): string {
  return isSecureDeployment() ? '__Host-howdy_session' : 'howdy_session';
}

/**
 * Secure cookies (Secure flag + `__Host-` prefix) for every production build and every https origin. Only a
 * development server on plain http gets the unprefixed, non-Secure cookie (browsers refuse Secure cookies on http
 * except for localhost, and dev tooling needs to work over http).
 */
export function isSecureDeployment(): boolean {
  const env = getEnv();
  return env.NODE_ENV === 'production' || env.APP_URL.startsWith('https://');
}
