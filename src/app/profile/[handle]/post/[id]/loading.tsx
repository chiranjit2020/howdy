import { PostSkeleton } from '@/ui/howdy';
import { Skeleton } from '@/ui/primitives';

/** One post's outline, in Home's frame (its own, so the profile's cover outline never flashes before it). */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      className="flex w-full flex-col gap-4 py-4 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-6"
    >
      <main id="main" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
        <p role="status" className="sr-only">
          Loading…
        </p>
        <Skeleton className="h-7 w-48" />
        <PostSkeleton />
      </main>
      <div aria-hidden="true" className="hidden xl:block" />
    </div>
  );
}
