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

/**
 * Home's frame (Friends, Profile visitors): the 672 px column and, on wide screens, the 20 rem right panel holding `rail`
 * striped cards — the same boxes as the page, so nothing jumps when it arrives.
 */
export function SkeletonFramedPage({ children, rail = 2 }: { children: ReactNode; rail?: number }) {
  return (
    <div className="flex w-full flex-col gap-4 py-4 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-6">
      <main id="main" aria-busy="true" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
        <p role="status" className="sr-only">
          Loading…
        </p>
        {children}
      </main>
      <div aria-hidden="true" className="hidden flex-col gap-4 xl:flex">
        {Array.from({ length: rail }, (_, i) => (
          <SkeletonRailCard key={i} />
        ))}
      </div>
    </div>
  );
}

/** A right-panel card: the stripe along the top, a small title and two lines. */
export function SkeletonRailCard() {
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4 shadow-clay">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

/** A page heading (and the little "?" beside it, where the page still has one). */
export function SkeletonTitle({ width = 'w-32', hint = true }: { width?: string; hint?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className={cn('h-7', width)} />
      {hint && <Skeleton className="size-5 rounded-full" />}
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
