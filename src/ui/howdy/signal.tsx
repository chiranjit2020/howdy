import { cn } from '../cn';

/** The Signal: a short, self-expiring status line shown on a Ranch. */
export function Signal({
  text,
  expiresLabel,
  className,
}: {
  text: string;
  expiresLabel?: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-pill border-2 border-dashed border-border-strong bg-warning px-4 py-1.5 text-caption text-on-warning',
        className,
      )}
    >
      <span aria-hidden="true">⚡</span>
      <span className="sr-only">Signal: </span>
      <span className="min-w-0 break-words">{text}</span>
      {expiresLabel && <span className="shrink-0 font-mono text-metadata opacity-80">{expiresLabel}</span>}
    </p>
  );
}
