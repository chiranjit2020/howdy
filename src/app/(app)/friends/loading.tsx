import { SkeletonFramedPage, SkeletonListCard, SkeletonTitle } from '@/ui/howdy';

/** Friends' outline in Home's frame: the heading, the list of friends, and the right panel's cards. */
export default function Loading() {
  return (
    <SkeletonFramedPage rail={3}>
      <SkeletonTitle width="w-28" hint={false} />
      <SkeletonListCard rows={4} />
    </SkeletonFramedPage>
  );
}
