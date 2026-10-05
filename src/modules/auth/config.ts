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
  /** Attempts to download my data (each re-checks the password, so limited like a sign-in). Spent before the check. */
  exportAttempt: rule(10, 3600),
  /** Downloads that passed the password check: a few a day is plenty, and each one reads everything I have. */
  exportDone: rule(3, 86_400),
  /**
   * Second-step attempts per ACCOUNT (ADR-040), spent before the code is checked. A 6-digit code has a million values
   * and three are valid at a time: at 5 per 15 minutes a guesser needs years on average. The password must be right
   * for each attempt too.
   */
  secondStep: rule(5, 900),
  /** Re-typing the password to change sign-in security (add/remove a passkey, the app, recovery codes). */
  securityChange: rule(10, 3600),
  /** Asking for a passkey challenge, per source. Cheap, but each one is a row until it expires. */
  passkeyOptionsIp: rule(60, 900),
} as const;

/** How long the browser has to answer a passkey challenge. */
export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * MIN;
/** How long a half-set-up authenticator app waits for its first code before it has to be started again. */
export const TOTP_SETUP_TTL_MS = 15 * MIN;
/** Passkeys per account: plenty for a phone, a laptop and a spare key, and a bound on what one account can store. */
export const MAX_PASSKEYS = 10;

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
