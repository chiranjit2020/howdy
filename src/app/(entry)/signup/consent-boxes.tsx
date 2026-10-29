'use client';

import { LEGAL_FACTS } from '@/shared/legal';
import { AlertIcon } from '@/ui/icons';
import { Checkbox } from '@/ui/primitives';

const LINK = 'font-semibold text-accent-strong no-underline hover:underline';

/** Small and inline, like the fields' own errors (the box above it carries aria-invalid). */
function BoxError({ children }: { children: string }) {
  return (
    <p role="alert" className="-mt-1 mb-1 ml-8 flex items-start gap-1.5 text-caption font-medium text-danger">
      <AlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The two boxes at the end of Sign up: old enough, and agreeing to the Terms and Privacy Policy. Both must be ticked;
 * together they are the one `acceptTerms` the server records with the document versions (nothing new is stored). The
 * links open in a new tab so a half-filled form is never lost.
 */
export function ConsentBoxes({
  age,
  terms,
  onAge,
  onTerms,
  ageError,
  termsError,
}: {
  age: boolean;
  terms: boolean;
  onAge: (v: boolean) => void;
  onTerms: (v: boolean) => void;
  ageError?: string | undefined;
  termsError?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <Checkbox
        name="ageConfirm"
        checked={age}
        onChange={(e) => onAge(e.target.checked)}
        aria-invalid={ageError ? true : undefined}
        label={
          <span className="text-caption font-normal text-text-secondary">
            I confirm that I am {LEGAL_FACTS.minimumAge} or older
          </span>
        }
      />
      {ageError && <BoxError>{ageError}</BoxError>}
      <Checkbox
        name="acceptTerms"
        checked={terms}
        onChange={(e) => onTerms(e.target.checked)}
        aria-invalid={termsError ? true : undefined}
        label={
          // A span, not a fragment: the label is a flex column, which would turn bare links into blocks.
          <span className="text-caption font-normal text-text-secondary">
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener" className={LINK}>
              Terms of Service
            </a>{' '}
            &amp;{' '}
            <a href="/privacy" target="_blank" rel="noopener" className={LINK}>
              Privacy Policy
            </a>
          </span>
        }
        hint={
          <>
            Please also read the{' '}
            <a href="/community-guidelines" target="_blank" rel="noopener" className={LINK}>
              Community Guidelines
            </a>
            .
          </>
        }
      />
      {termsError && <BoxError>{termsError}</BoxError>}
    </div>
  );
}
