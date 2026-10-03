import { SkeletonPage } from '@/ui/howdy';
import { Skeleton } from '@/ui/primitives';

/** Home's outline: the greeting card (picture, name, four "at a glance" tiles, one small button) and Open Gates. */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="clay flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-16 shrink-0 rounded-pill" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-3.5 w-2/5" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
        <Skeleton className="h-11 w-36 rounded-pill" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
    </SkeletonPage>
  );
}
