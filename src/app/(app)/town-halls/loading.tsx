import { SkeletonListCard, SkeletonPage, SkeletonTitle } from '@/ui/howdy';

/** Town Halls' outline: the heading and a couple of hall cards (this page uses the wider column). */
export default function Loading() {
  return (
    <SkeletonPage wide>
      <SkeletonTitle width="w-36" />
      <SkeletonListCard rows={2} />
      <SkeletonListCard rows={2} />
    </SkeletonPage>
  );
}
