'use client';

import { FormMessage } from '@/ui/auth/form-parts';
import { CheckCircleIcon } from '@/ui/icons';
import { buttonClasses, Input } from '@/ui/primitives';

export interface IdentityCheckProps {
  /** False for someone who joined with Google and never set a password. */
  hasPassword: boolean;
  /** This session confirmed with Google in the last few minutes (only matters without a password). */
  googleConfirmed: boolean;
  /** The Settings page and section to come back to after Google, e.g. "/settings/account#export". */
  next: string;
}

/** Can the form go ahead without anything more from the person? */
export const identityReady = (p: Pick<IdentityCheckProps, 'hasPassword' | 'googleConfirmed'>) =>
  p.hasPassword || p.googleConfirmed;

/**
 * "Prove it's you again" for downloading data, closing the account and changing sign-in security. With a password: the
 * password box, as always. Without one (joined with Google): a button that makes Google ask them to sign in again and
 * brings them straight back here; once done, a line saying so, and the form's own button does the rest.
 */
export function IdentityCheck({
  hasPassword,
  googleConfirmed,
  next,
  password,
  onPassword,
  error,
}: IdentityCheckProps & {
  password: string;
  onPassword: (value: string) => void;
  error: string | undefined;
}) {
  if (hasPassword) {
    return (
      <Input
        label="Your password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => onPassword(e.target.value)}
        error={error}
      />
    );
  }
  const confirmHref = `/api/auth/google/confirm?next=${encodeURIComponent(next)}`;
  if (googleConfirmed && !error) {
    return (
      <p className="flex items-center gap-1.5 text-caption text-text-secondary">
        <CheckCircleIcon className="size-4 text-success-text" />
        Confirmed with Google. This lasts 10 minutes.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <p className="text-caption text-text-secondary">
        You joined with Google, so there is no password to type. Confirm it&rsquo;s you with Google instead:
        it asks you to sign in again, then brings you back here.
      </p>
      {/* A plain link (a page load): Google's sign-in page cannot open inside a fetch. */}
      <a href={confirmHref} className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} self-start`}>
        Confirm with Google
      </a>
    </div>
  );
}
