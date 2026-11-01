import { SkeletonFormCard } from '@/ui/howdy';

/**
 * A Settings section's outline, under the heading and tabs (the layout shows those at once, and carries the <main>):
 * a couple of form cards.
 */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        Loading…
      </p>
      <SkeletonFormCard fields={2} />
      <SkeletonFormCard fields={2} />
    </div>
  );
}
