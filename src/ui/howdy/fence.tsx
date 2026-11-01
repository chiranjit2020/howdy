import { Children, isValidElement, useId, type ReactNode } from 'react';
import { Button } from '../primitives/button';
import { EmptyState } from '../primitives/feedback';
import { FenceIcon } from '../icons';
import { GlossaryHint } from './glossary-hint';
import { POST_LIST } from './post-card';

/**
 * The Fence: the public wall on a Ranch. A list of Post Cards, newest first, with cursor-style
 * "load more" (never infinite scroll — the Fence is a place, not a feed).
 */
export function Fence({
  children,
  composer,
  hasMore,
  onLoadMore,
  loadingMore,
  emptyHint = 'The wall is quiet. Write the first post.',
  title = 'The wall',
}: {
  children?: ReactNode;
  composer?: ReactNode;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  emptyHint?: string;
  /** The list's heading. A wall says "The wall" (with its glossary hint); Home's feed says what it is. */
  title?: string;
}) {
  const headingId = useId();
  const cards = Children.toArray(children);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex items-center">
        <h2 id={headingId} className="font-display text-heading text-text-primary">
          {title}
        </h2>
        {title === 'The wall' && <GlossaryHint term="fence" />}
      </div>
      {composer}
      {cards.length === 0 ? (
        <EmptyState
          // The same muted line icon as every other empty list (the clay picture and the log emoji predate the flat look).
          icon={<FenceIcon className="text-text-muted" />}
          title="No posts yet"
          description={emptyHint}
        />
      ) : (
        <ol className={POST_LIST}>
          {cards.map((card, i) => (
            // Keyed by the card's own key so a card keeps its state (replies open, typing) when others come and go.
            <li key={isValidElement(card) && card.key !== null ? card.key : i}>{card}</li>
          ))}
        </ol>
      )}
      {hasMore && (
        <Button variant="secondary" onClick={onLoadMore} loading={loadingMore} className="self-center">
          Older posts
        </Button>
      )}
    </section>
  );
}
