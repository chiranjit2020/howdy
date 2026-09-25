import { Children, isValidElement, useId, type ReactNode } from 'react';
import { Button } from '../primitives/button';
import { EmptyState } from '../primitives/feedback';
import { GlossaryHint } from './glossary-hint';

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
  emptyHint = 'The Fence is quiet. Nail the first card.',
}: {
  children?: ReactNode;
  composer?: ReactNode;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  emptyHint?: string;
}) {
  const headingId = useId();
  const cards = Children.toArray(children);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex items-center">
        <h2 id={headingId} className="font-display text-heading text-text-primary">
          The Fence
        </h2>
        <GlossaryHint term="fence" />
      </div>
      {composer}
      {cards.length === 0 ? (
        <EmptyState icon="🪵" title="Nothing nailed up yet" description={emptyHint} />
      ) : (
        <ol className="flex flex-col gap-4">
          {cards.map((card, i) => (
            // Keyed by the card's own key so a card keeps its state (flipped, typing) when others come and go.
            <li key={isValidElement(card) && card.key !== null ? card.key : i}>{card}</li>
          ))}
        </ol>
      )}
      {hasMore && (
        <Button variant="secondary" onClick={onLoadMore} loading={loadingMore} className="self-center">
          Older cards
        </Button>
      )}
    </section>
  );
}
