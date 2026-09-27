import { SkeletonListCard, SkeletonPage, SkeletonTitle } from '@/ui/howdy';

/** Whispers' outline: the heading and the list of conversations. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle width="w-32" />
      <SkeletonListCard rows={4} heading={false} />
    </SkeletonPage>
  );
}
