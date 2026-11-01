import { SkeletonFramedPage, SkeletonListCard, SkeletonTitle } from '@/ui/howdy';

/** Visitors' outline in Home's frame: the heading, a card per day, and the two right-panel cards. */
export default function Loading() {
  return (
    <SkeletonFramedPage rail={2}>
      <SkeletonTitle width="w-40" hint={false} />
      <SkeletonListCard rows={3} />
      <SkeletonListCard rows={2} />
    </SkeletonFramedPage>
  );
}
