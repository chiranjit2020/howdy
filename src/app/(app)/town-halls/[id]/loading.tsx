import { SkeletonListCard, SkeletonPage, SkeletonTitle } from '@/ui/howdy';
import { Skeleton } from '@/ui/primitives';

/** One Town Hall's outline: its name and description, then the conversation and the members. */
export default function Loading() {
  return (
    <SkeletonPage wide>
      <SkeletonTitle width="w-48" />
      <Skeleton className="h-4 w-3/4" />
      <SkeletonListCard rows={3} />
      <SkeletonListCard rows={2} />
    </SkeletonPage>
  );
}
