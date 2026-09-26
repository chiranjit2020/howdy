import { SkeletonPage, SkeletonRow } from '@/ui/howdy';
import { Skeleton } from '@/ui/primitives';
import { cn } from '@/ui/cn';

/** A conversation's outline: who it is with, a few message bubbles on alternating sides, and the message box. */
export default function Loading() {
  const bubbles = ['w-2/3', 'w-1/2', 'w-3/5', 'w-2/5'];
  return (
    <SkeletonPage className="sm:py-6">
      <SkeletonRow />
      <div className="flex flex-col gap-3">
        {bubbles.map((width, i) => (
          <Skeleton key={i} className={cn('h-12 rounded-2xl', width, i % 2 === 1 && 'self-end')} />
        ))}
      </div>
      <Skeleton className="h-12 w-full rounded-pill" />
    </SkeletonPage>
  );
}
