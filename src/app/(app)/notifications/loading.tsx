import { SkeletonFramedPage, SkeletonRow, SkeletonTitle } from '@/ui/howdy';

/** Notifications' outline in Home's frame: the heading, then one card of rows, like the page itself. */
export default function Loading() {
  return (
    <SkeletonFramedPage rail={0}>
      <SkeletonTitle width="w-36" hint={false} />
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="px-4 py-3">
            <SkeletonRow />
          </div>
        ))}
      </div>
    </SkeletonFramedPage>
  );
}
