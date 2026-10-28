import { SkeletonListCard } from '@/ui/howdy';
import { Skeleton } from '@/ui/primitives';

/**
 * A Porch's outline, in the page's own two-column grid: the cover with picture and name, the Fence below it, and the
 * Signal and Pals cards on the right (stacked underneath on a phone).
 */
export default function Loading() {
  return (
    <main
      id="main"
      aria-busy="true"
      className="grid items-start gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div className="flex flex-col gap-6 lg:col-start-1">
        <div className="clay overflow-hidden">
          <Skeleton className="h-28 w-full rounded-none sm:h-36" />
          <div className="flex flex-col gap-3 px-5 pb-6 sm:px-7">
            <Skeleton className="-mt-10 size-20 rounded-full border-4 border-surface" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
        <div className="clay flex flex-col gap-3 p-5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
      </div>
      <div className="flex flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="clay flex flex-col gap-3 p-5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <SkeletonListCard rows={2} />
      </div>
    </main>
  );
}
