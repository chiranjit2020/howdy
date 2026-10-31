import { ComposerSkeleton, PostSkeleton } from '@/ui/howdy';
import { Skeleton } from '@/ui/primitives';

/**
 * A profile's outline, in the page's own frame (Home's: the same column and, from xl, the same right panel), so nothing
 * moves when the real page arrives: the cover with picture and name, "The wall", its post box and two posts.
 */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      className="flex w-full flex-col gap-4 py-4 xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-6"
    >
      <main id="main" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
        <p role="status" className="sr-only">
          Loading…
        </p>
        {/* The same shapes as RanchCover and RanchHeader: the cover, the 112 px picture over its edge, name and @username
            beside it from sm up (under it on a phone), each as tall as its line of text. */}
        <div className="clay overflow-hidden">
          <Skeleton className="h-40 w-full rounded-none sm:h-52" />
          <div className="flex flex-col gap-3 px-5 pb-6 sm:flex-row sm:items-end sm:gap-5 sm:px-7">
            <Skeleton className="-mt-14 size-28 shrink-0 self-start rounded-pill border-4 border-surface" />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-7 items-center sm:h-8">
                <Skeleton className="h-5 w-40 sm:h-6" />
              </div>
              <div className="flex h-5 items-center">
                <Skeleton className="h-3.5 w-28" />
              </div>
            </div>
          </div>
        </div>
        {/* "The wall", as tall as its heading line. */}
        <div className="flex h-7 items-center sm:h-8">
          <Skeleton className="h-5 w-28 sm:h-6" />
        </div>
        <ComposerSkeleton />
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
