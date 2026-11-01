import { Skeleton } from '@/ui/primitives';

/** One settings row as it will arrive: a label, a line of explanation, and its switch on the right. */
function Row() {
  return (
    <div className="flex items-center gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <Skeleton className="h-6 w-10 shrink-0 rounded-pill" />
    </div>
  );
}

/**
 * A Settings section's outline, under the heading and tabs (the layout shows those at once, in Home's frame, and carries
 * the <main>): cards of label-and-switch rows, the shape most sections have — no Save buttons, as they have none.
 */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        Loading…
      </p>
      {[3, 2].map((rows, i) => (
        <div key={i} className="clay flex flex-col gap-5 p-5">
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: rows }, (_, j) => (
            <Row key={j} />
          ))}
        </div>
      ))}
    </div>
  );
}
