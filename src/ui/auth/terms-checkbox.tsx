'use client';

import { LEGAL_FACTS } from '@/shared/legal';
import { Checkbox } from '../primitives';

const LINK = 'font-medium text-auth-link underline underline-offset-4';

/**
 * "I am 18 or older and agree to the Terms and the Privacy Policy." Used at Stake a Claim and on /agree. The links
 * open in a new tab so a half-filled form is never lost.
 */
export function TermsCheckbox({
  checked,
  onChange,
  invalid,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  invalid?: boolean;
}) {
  return (
    <Checkbox
      name="acceptTerms"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-invalid={invalid || undefined}
      label={
        // A span, not a fragment: the label is a flex column, which would turn bare links into blocks (no longer in-sentence).
        <span>
          I am {LEGAL_FACTS.minimumAge} or older, and I agree to the{' '}
          <a href="/terms" target="_blank" rel="noopener" className={LINK}>
            Terms of Service
          </a>{' '}
          and the{' '}
          <a href="/privacy" target="_blank" rel="noopener" className={LINK}>
            Privacy Policy
          </a>
          .
        </span>
      }
      hint={
        <>
          Please also read the{' '}
          <a href="/campfire-rules" target="_blank" rel="noopener" className={LINK}>
            Campfire Rules
          </a>
          .
        </>
      }
    />
  );
}
