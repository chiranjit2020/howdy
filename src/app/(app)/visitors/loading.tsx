import { SkeletonListCard, SkeletonPage, SkeletonTitle } from '@/ui/howdy';
import { Skeleton } from '@/ui/primitives';

/** Tracks' outline: the heading, the Shadow Walk switch and the list of who stopped by. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle width="w-24" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <SkeletonListCard rows={4} />
    </SkeletonPage>
  );
}
