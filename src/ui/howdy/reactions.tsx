'use client';

import { useState } from 'react';
import { REACTION_KINDS, type ReactionKind } from '@/shared/validation/fence';
import { cn } from '../cn';
import { StarFillIcon, StarIcon } from '../icons';

/** The kind a Star is saved as. The database keeps its five kinds (no migration); Howdy shows every one as a Star. */
export const STAR_KIND: ReactionKind = 'love';

// The logo's three sparks, fanned above the star's top: rounded drops on a 20-unit box (the star's own), drawn outside it.
const SPARKS = [
  { cx: 1.68, cy: -1.88, ry: 2.6, turn: -35 },
  { cx: 11.26, cy: -4.44, ry: 3, turn: 5 },
  { cx: 20.25, cy: -0.25, ry: 2.6, turn: 45 },
];

/**
 * The Star itself: an outline when not given, filled deep Sunflower when given. `burst` (a number that grows with each
 * new give) replays the pop and the sparks; it stays 0 on load, so stars you gave earlier do not all burst at once.
 */
export function StarMark({
  given,
  burst = 0,
  className,
}: {
  given: boolean;
  burst?: number;
  className?: string;
}) {
  const Icon = given ? StarFillIcon : StarIcon;
  return (
    <span aria-hidden="true" className={cn('relative inline-flex size-[1.25em]', className)}>
      <span
        key={burst}
        className={cn(
          'inline-flex size-full',
          given && 'text-star',
          given && burst > 0 && 'animate-star-pop',
        )}
      >
        <Icon className="size-full" />
      </span>
      {given && burst > 0 && (
        <svg
          key={`s${burst}`}
          viewBox="0 0 20 20"
          className="pointer-events-none absolute inset-0 size-full animate-sparks overflow-visible fill-primary"
        >
          {SPARKS.map((d) => (
            <ellipse
              key={d.turn}
              cx={d.cx}
              cy={d.cy}
              rx={1.5}
              ry={d.ry}
              transform={`rotate(${d.turn} ${d.cx} ${d.cy})`}
            />
          ))}
        </svg>
      )}
    </span>
  );
}

/** "You", "You and 1 other", "You and 3 others": said once you have given a Star, so you see you are part of it. */
function withYou(total: number) {
  const others = total - 1;
  return others <= 0 ? 'You' : `You and ${others} ${others === 1 ? 'other' : 'others'}`;
}

/**
 * A post's reaction (2026-11-07): one Star and its count, beside Reply. One gesture replaced the Yo button, the emoji
 * picker and the stacked emoji discs, which confused people; a Star in Howdy's Sunflower (not a heart) keeps it ours.
 * Once given, the count reads "You and 2 others". Older reactions of other kinds count as Stars, and yours shows filled;
 * tapping it takes yours back. Without `onReact` (you may not react here) it is the count alone, not a button.
 */
export function StarButton({
  reactions,
  mine,
  onReact,
}: {
  reactions: Record<ReactionKind, number>;
  mine: ReactionKind | null;
  /** Give a Star, or `null` to take yours back. */
  onReact?: (kind: ReactionKind | null) => void;
}) {
  const total = REACTION_KINDS.reduce((sum, k) => sum + reactions[k], 0);
  const given = mine !== null;
  // Burst each time it turns given (a tap or a double-click on the post), never for a Star already given on load.
  const [burst, setBurst] = useState(0);
  const [wasGiven, setWasGiven] = useState(given);
  if (given !== wasGiven) {
    setWasGiven(given);
    if (given) setBurst((b) => b + 1);
  }
  const star = <StarMark given={given} burst={burst} className="text-[1.25rem]" />;
  const look = 'inline-flex items-center gap-1.5 text-caption font-semibold';
  if (!onReact) {
    if (total === 0) return null;
    return (
      <span
        role="img"
        className={cn(look, 'text-text-secondary')}
        aria-label={`${total} ${total === 1 ? 'Star' : 'Stars'}`}
      >
        {star}
        <span className="tabular-nums">{total}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={given}
      aria-label={`Star${total > 0 ? `, ${total}` : ''}`}
      title={given ? 'Take back your Star' : 'Give a Star'}
      onClick={() => onReact(given ? null : STAR_KIND)}
      className={cn(
        look,
        // Same size and shape as Reply: a ghost pill that greys on hover. -ml-3 puts the star on the text edge above it;
        // the hover pill still has its padding, reaching into the card's margin.
        '-ml-3 min-h-11 rounded-pill px-3 text-text-primary transition-colors duration-150 hover:bg-surface-sunken pointer-fine:min-h-8',
      )}
    >
      {star}
      {/* A bare "0" says nothing: the count shows once someone has given a Star. */}
      {given ? <span>{withYou(total)}</span> : total > 0 && <span className="tabular-nums">{total}</span>}
    </button>
  );
}
