import { SkeletonRow } from '@/ui/howdy';
import { Skeleton } from '@/ui/primitives';
import { cn } from '@/ui/cn';

/**
 * A conversation's outline, in the chat pane (the Messages frame carries the page's <main>): who it is with, a few
 * bubbles on alternating sides, and the reply bar at the bottom — the same card the chat fills.
 */
export default function Loading() {
  const bubbles = ['w-2/3', 'w-1/2', 'w-3/5', 'w-2/5'];
  return (
    <div
      aria-busy="true"
      className="clay flex min-h-0 flex-1 flex-col max-md:rounded-none max-md:border-0 max-md:shadow-none"
    >
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div className="border-b border-border px-3 py-2">
        <SkeletonRow />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3 bg-chat p-3">
        {bubbles.map((width, i) => (
          <Skeleton key={i} className={cn('h-10 rounded-2xl', width, i % 2 === 1 && 'self-end')} />
        ))}
      </div>
      <div className="border-t border-border px-3 py-2">
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    </div>
  );
}
