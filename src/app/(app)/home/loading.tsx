import { SkeletonPage } from '@/ui/howdy';
import { Skeleton } from '@/ui/primitives';

/** Home's outline: the greeting card (picture, name, one wide button, a row of three) and the folded Open Gates line. */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="clay flex flex-col gap-3 p-4 sm:gap-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-lg sm:size-14" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-2/5" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        </div>
        <Skeleton className="h-11 w-full rounded-pill" />
        <div className="flex gap-2">
          <Skeleton className="h-11 flex-1 rounded-pill" />
          <Skeleton className="h-11 flex-1 rounded-pill" />
          <Skeleton className="h-11 flex-1 rounded-pill" />
        </div>
      </div>
      <Skeleton className="mx-1 h-4 w-48" />
    </SkeletonPage>
  );
}
