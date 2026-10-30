import { Skeleton } from '@/ui/primitives';

/** A post card's outline: who, a line or two of words, and the row of reactions. */
function PostSkeleton({ photo = false }: { photo?: boolean }) {
  return (
    <div className="clay flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-pill" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-4 w-4/5" />
      {photo && <Skeleton className="aspect-[3/2] w-full rounded-md" />}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <Skeleton className="h-6 w-24 rounded-pill" />
        <Skeleton className="h-6 w-16 rounded-pill" />
      </div>
    </div>
  );
}

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
        <div className="clay flex flex-col gap-2 p-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-16 w-full" />
          <div className="flex justify-between">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
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
