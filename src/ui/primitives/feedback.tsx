import type { ReactNode } from 'react';
import { Art, Glyph } from '../art/glyph';
import { cn } from '../cn';
import { Button } from './button';

export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4';

/**
 * Decorative placeholder. Hidden from assistive tech; pair with <LoadingState> (or a role="status" line) for the
 * announcement. Corners default to rounded-md; a `rounded-*` class in `className` replaces that (cn does not merge).
 */
export function Skeleton({ className }: { className?: string }) {
  const ownCorners = /(^|\s)rounded(-|\s|$)/.test(className ?? '');
  return (
    <div
      aria-hidden="true"
      className={cn('animate-shimmer bg-border', !ownCorners && 'rounded-md', className)}
    />
  );
}

export function LoadingState({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center justify-center gap-3 p-8 text-text-secondary', className)}
    >
      {/* The brand loader: a ring of pastel dots, turning. Decorative; the label below is what is announced. */}
      <Art name="loader" size="free" className="w-14 animate-loader-spin" />
      <span className="text-caption">{label}…</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  as: Heading = 'h3',
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Heading level; must be one deeper than the surrounding section heading. */
  as?: HeadingTag;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 p-8 text-center', className)}>
      {icon && (
        <div aria-hidden="true" className="text-display">
          {typeof icon === 'string' ? <Glyph emoji={icon} size="hero" /> : icon}
        </div>
      )}
      <Heading className="text-title text-text-primary">{title}</Heading>
      {description && <p className="max-w-prose text-body text-text-secondary">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Safe error display: shows the request id (support handle) but never internals. */
export function ErrorState({
  title = 'Something went sideways',
  description = 'It’s on our side. Give it another try in a moment.',
  requestId,
  onRetry,
  className,
  as: Heading = 'h3',
}: {
  title?: string;
  description?: ReactNode;
  requestId?: string;
  onRetry?: () => void;
  className?: string;
  /** Heading level; must be one deeper than the surrounding section heading. */
  as?: HeadingTag;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-2 rounded-lg bg-danger-soft p-8 text-center', className)}
    >
      <Heading className="text-title text-text-primary">{title}</Heading>
      <p className="max-w-prose text-body text-text-secondary">{description}</p>
      {requestId && <p className="font-mono text-metadata text-text-muted">Ref: {requestId}</p>}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}
