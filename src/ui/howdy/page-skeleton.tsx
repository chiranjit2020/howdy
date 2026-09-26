import type { ReactNode } from 'react';
import { cn } from '../cn';
import { Skeleton } from '../primitives/feedback';

/*
 * Page outlines shown by each route's loading.tsx the instant a tab or link is tapped, while the server builds the real
 * page. Each mirrors its page's layout (same width, spacing and card shapes) so nothing jumps when the content arrives.
 * Decorative: the only thing announced is "Loading".
 */

/** The shared frame: the same <main> box the pages use, marked busy, with one polite "Loading" for screen readers. */
export function SkeletonPage({
  children,
  wide = false,
  className,
}: {
  children: ReactNode;
  /** Town Halls use a wider column (max-w-2xl) than the other pages (max-w-xl). */
  wide?: boolean;
  className?: string;
}) {
  return (
    <main
      id="main"
      aria-busy="true"
      className={cn(
        'mx-auto flex w-full flex-col gap-4 py-4 sm:gap-6 sm:py-8',
        wide ? 'max-w-2xl' : 'max-w-xl',
        className,
      )}
    >
      <p role="status" className="sr-only">
        Loading…
      </p>
      {children}
    </main>
  );
}

/** A page heading (and the little "?" beside it). */
export function SkeletonTitle({ width = 'w-32' }: { width?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className={cn('h-7', width)} />
      <Skeleton className="size-5 rounded-full" />
    </div>
  );
}

/** One person/notification row: round picture, a name line and a smaller line under it. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="size-11 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  );
}

/** A clay card holding `rows` rows, with an optional heading line. */
export function SkeletonListCard({ rows = 3, heading = true }: { rows?: number; heading?: boolean }) {
  return (
    <div className="clay flex flex-col gap-4 p-4 sm:p-5">
      {heading && <Skeleton className="h-5 w-28" />}
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

/** A clay card shaped like a form: a heading, `fields` labelled inputs and a button. */
export function SkeletonFormCard({ fields = 2 }: { fields?: number }) {
  return (
    <div className="clay flex flex-col gap-4 p-4 sm:p-5">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      ))}
      <Skeleton className="h-11 w-28 rounded-pill" />
    </div>
  );
}
