import { SkeletonPage, SkeletonRow, SkeletonTitle } from '@/ui/howdy';
import { Skeleton } from '@/ui/primitives';

/** Chimes' outline: the heading, the "caught up" line and a stack of notification cards. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle width="w-28" />
      <Skeleton className="h-4 w-24" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="clay p-4">
            <SkeletonRow />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
