import { Art } from '../art/glyph';
import { cn } from '../cn';

/**
 * The blue badge beside the Howdy team account's name. The picture is decorative; screen readers hear "Verified" as part
 * of the name, and hovering shows what it means.
 */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span title="Verified · the Howdy team" className={cn('inline-flex shrink-0 align-[-0.2em]', className)}>
      <Art name="verified" size="free" className="size-[1.15em]" />
      <span className="sr-only"> (Verified)</span>
    </span>
  );
}

/**
 * The gold tick beside a member who has earned it from their Pals (ADR-020). Deliberately a different colour and shape
 * from the team's blue badge, so nobody mistakes a member for the team. Screen readers hear "Trusted".
 */
export function TrustedBadge({ className }: { className?: string }) {
  return (
    <span title="Trusted · earned from Pals" className={cn('inline-flex shrink-0 align-[-0.2em]', className)}>
      <svg
        viewBox="0 0 24 24"
        width="1.15em"
        height="1.15em"
        aria-hidden="true"
        focusable="false"
        className="size-[1.15em]"
      >
        {/* A scalloped seal (eight bumps), like a wax stamp, with a tick pressed into it. */}
        <path
          d="M12 1.8l2.3 1.9 2.9-.6 1.1 2.8 2.8 1.1-.6 2.9 1.9 2.3-1.9 2.3.6 2.9-2.8 1.1-1.1 2.8-2.9-.6L12 22.2l-2.3-1.9-2.9.6-1.1-2.8-2.8-1.1.6-2.9L1.6 12l1.9-2.3-.6-2.9 2.8-1.1 1.1-2.8 2.9.6z"
          className="fill-trusted stroke-trusted-edge"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M7.8 12.3l2.8 2.8 5.6-5.8"
          fill="none"
          className="stroke-trusted-ink"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only"> (Trusted)</span>
    </span>
  );
}

/** Whichever badge a person carries after their name: the team's Verified, else an earned Trusted tick, else nothing. */
export function NameBadge({
  verified,
  trusted,
  className,
}: {
  verified?: boolean | undefined;
  trusted?: boolean | undefined;
  className?: string;
}) {
  if (verified) return <VerifiedBadge {...(className ? { className } : {})} />;
  if (trusted) return <TrustedBadge {...(className ? { className } : {})} />;
  return null;
}
