import { Skeleton } from '../primitives';

/**
 * A post card's outline while a page loads: who, a line or two of words, and the row of reactions. Home and profiles
 * draw the same one, so a loading wall looks exactly like the posts that replace it.
 */
export function PostSkeleton({ photo = false }: { photo?: boolean }) {
  return (
    <div className="clay flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-pill" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-4 w-4/5" />
      {photo && <Skeleton className="aspect-[3/2] w-full rounded-md" />}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <Skeleton className="h-6 w-24 rounded-pill" />
        <Skeleton className="h-6 w-16 rounded-pill" />
      </div>
    </div>
  );
}

/**
 * The one-line post box's outline (the box and its camera button), as every post box starts. The box is as tall as the
 * real one: 44 px for fingers, 42 px with a mouse (one line of text and its padding, above the 36 px minimum).
 */
export function ComposerSkeleton() {
  return (
    <div className="clay flex items-center gap-2 p-4">
      <Skeleton className="h-11 flex-1 pointer-fine:h-[2.625rem]" />
      <Skeleton className="size-11 shrink-0 rounded-pill pointer-fine:size-9" />
    </div>
  );
}
