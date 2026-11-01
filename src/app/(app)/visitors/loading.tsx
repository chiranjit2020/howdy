import { SkeletonListCard, SkeletonPage, SkeletonTitle } from '@/ui/howdy';

/** Visitors' outline: the heading and the list of who stopped by (Private browsing sits in the right panel). */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle width="w-24" />
      <SkeletonListCard rows={4} />
    </SkeletonPage>
  );
}
