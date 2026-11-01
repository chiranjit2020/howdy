import { SkeletonListCard, SkeletonPage, SkeletonTitle } from '@/ui/howdy';

/** Friends' outline: the heading and the list of friends (adding people sits in the right panel). */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle width="w-28" />
      <SkeletonListCard rows={4} />
    </SkeletonPage>
  );
}
