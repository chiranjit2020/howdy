import { SkeletonFormCard, SkeletonFramedPage, SkeletonListCard, SkeletonTitle } from '@/ui/howdy';

/**
 * Time Capsules' outline in Home's frame: the heading and its line, the sealing form, and the opened ones. No right-panel
 * cards: most people have nothing coming or sealed, and a card that then vanishes would make the page jump.
 */
export default function Loading() {
  return (
    <SkeletonFramedPage rail={0}>
      <SkeletonTitle width="w-44" />
      <SkeletonFormCard fields={3} />
      <SkeletonListCard rows={1} />
    </SkeletonFramedPage>
  );
}
