import { SkeletonFormCard, SkeletonListCard, SkeletonPage, SkeletonTitle } from '@/ui/howdy';

/** Pals' outline: the heading, the "ask by call sign" form and the list of Pals. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle width="w-28" />
      <SkeletonFormCard fields={1} />
      <SkeletonListCard rows={3} />
    </SkeletonPage>
  );
}
