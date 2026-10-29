import { getEnv } from '@/platform/config/env';
import { AppError } from '@/platform/errors';
import { logger } from '@/platform/logger';

/**
 * Cloudflare Turnstile, the bot check on sign-up (security audit 2026-10-29, finding 3). The page gets a one-time token
 * from Cloudflare once it is satisfied the visitor is a person; the server asks Cloudflare whether that token is real,
 * unused, for this site and for this action. Rate limits alone cannot stop a farm of fresh addresses; this makes every
 * fake account cost a solved challenge.
 *
 * When Cloudflare says no, the sign-up is refused. When Cloudflare cannot be reached (an outage on their side, which an
 * attacker cannot cause), it is allowed and logged: a third party's bad day must not close sign-up.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_ACTION = 'signup';
export const TURNSTILE_FAILED_MESSAGE = 'We could not check that you are a person. Please try again.';

export function turnstileSiteKey(): string | null {
  const env = getEnv();
  return env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY ? env.TURNSTILE_SITE_KEY : null;
}

interface SiteVerifyAnswer {
  success?: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/** Throws AppError('BAD_REQUEST') unless Cloudflare vouches for the token. Does nothing when Turnstile is off. */
export async function assertHuman(token: string | undefined, ctx: { requestId: string }): Promise<void> {
  const env = getEnv();
  if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY) return;
  const refuse = (why: string) => {
    logger.warn({ event: 'auth.turnstile_refused', requestId: ctx.requestId, why });
    return new AppError('BAD_REQUEST', {
      message: TURNSTILE_FAILED_MESSAGE,
      fields: { turnstile: TURNSTILE_FAILED_MESSAGE },
    });
  };
  if (!token) throw refuse('missing');

  let answer: SiteVerifyAnswer;
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    answer = (await res.json()) as SiteVerifyAnswer;
  } catch (err) {
    logger.warn({
      event: 'auth.turnstile_unavailable',
      requestId: ctx.requestId,
      reason: err instanceof Error ? err.message : 'unknown',
    });
    return; // fail open: see above
  }

  if (answer.success !== true) throw refuse((answer['error-codes'] ?? ['unknown']).join(',').slice(0, 80));
  // Cloudflare's published test secrets (1x…, 2x…, 3x… followed by zeros) answer with a dummy action and hostname. They
  // are public and always pass anyway, so skipping these two checks for them weakens nothing; real keys get both.
  if (/^[123]x0{20,}AA$/.test(env.TURNSTILE_SECRET_KEY)) return;
  if (answer.action !== TURNSTILE_ACTION) throw refuse('action');
  // A token solved on some other site that uses the same key must not count here.
  if (answer.hostname && answer.hostname !== new URL(env.APP_URL).hostname) throw refuse('hostname');
}
