import { ComposerSkeleton, PostSkeleton } from '@/ui/howdy';
import { Skeleton } from '@/ui/primitives';

/**
 * Home's outline, in Home's own layout (the same grid, column width and right panel as page.tsx), so nothing moves when
 * the real page arrives: your Story, "What's on your mind?", two posts, and on wide screens the right panel's cards.
 */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      className="flex w-full py-4 xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-6"
    >
      <main id="main" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
        <p role="status" className="sr-only">
          Loading…
        </p>
        <div className="flex flex-col items-center gap-1.5 self-start">
          <Skeleton className="size-14 rounded-pill" />
          <Skeleton className="h-3 w-14" />
        </div>
        {/* "What's on your mind?" is one line with a camera button until you click in. */}
        <ComposerSkeleton />
        <Skeleton className="h-6 w-32" />
        <div className="flex flex-col gap-2.5">
          <PostSkeleton />
          <PostSkeleton photo />
        </div>
      </main>
      <aside aria-hidden="true" className="hidden flex-col gap-4 xl:flex">
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </aside>
    </div>
  );
}
