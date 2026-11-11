import { DISPOSABLE_DOMAINS } from './disposable-domains.data';

/**
 * Throwaway email services (mailinator, 10minutemail and ~10,000 more) are how one person makes many accounts: an
 * inbox per account, made in a second, gone in an hour. A Howdy account must be reachable later (password reset,
 * account notices), so sign-up refuses them (2026-11-12). Server-side only: the list never ships to phones.
 *
 * Refresh the list with `node scripts/update-disposable-domains.mjs`.
 */
let blocked: Set<string> | undefined;

/**
 * Real providers that a list once caught by mistake. A domain here is always allowed, whatever the list says. Add one
 * when a real person reports it (and say who/when beside it).
 */
const ALLOWED = new Set<string>([]);

/** What sign-up says. Calm and specific: what is wrong, and what to do instead. */
export const DISPOSABLE_EMAIL_MESSAGE =
  'This looks like a temporary email address. Please use one you’ll keep, like Gmail or Outlook, so you can always get back into your account.';

/**
 * Is this email at a throwaway service? Checks the domain and every parent of it, so `x.mailinator.com` is caught as
 * well as `mailinator.com`. Expects an email that already passed `emailSchema` (trimmed, lowercased, one @).
 */
export function isDisposableEmail(email: string): boolean {
  blocked ??= new Set(DISPOSABLE_DOMAINS.split('\n').filter(Boolean));
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  if (ALLOWED.has(domain)) return false;
  const labels = domain.split('.');
  // Every suffix with at least two labels: a.b.mailinator.com, b.mailinator.com, mailinator.com (never just "com").
  for (let i = 0; i < labels.length - 1; i++) {
    if (blocked.has(labels.slice(i).join('.'))) return true;
  }
  return false;
}
