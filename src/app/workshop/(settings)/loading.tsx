import { SkeletonFormCard, SkeletonPage, SkeletonTitle } from '@/ui/howdy';

/** The Workshop's outline: the heading and its stack of settings forms. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle width="w-36" />
      <SkeletonFormCard fields={2} />
      <SkeletonFormCard fields={2} />
      <SkeletonFormCard fields={3} />
    </SkeletonPage>
  );
}
