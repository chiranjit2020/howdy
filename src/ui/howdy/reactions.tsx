'use client';

import { REACTION_KINDS, type ReactionKind } from '@/shared/validation/fence';
import { Art, type ArtName } from '../art/glyph';
import { cn } from '../cn';
import { ReactIcon } from '../icons';
import { Popover } from '../primitives/popover';

export const REACTION_LABEL: Record<ReactionKind, string> = {
  yo: 'Yo',
  laugh: 'Laugh',
  fire: 'Fire',
  popcorn: 'Popcorn',
  love: 'Love',
};

const REACTION_ART: Record<ReactionKind, ArtName> = {
  yo: 'react-yo',
  laugh: 'react-laugh',
  fire: 'react-fire',
  popcorn: 'react-popcorn',
  love: 'react-love',
};

export function ReactionArt({ kind, className }: { kind: ReactionKind; className?: string }) {
  return <Art name={REACTION_ART[kind]} size="free" className={cn('size-5', className)} />;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The biggest few kinds as overlapping art, then the total. Counts only: never who reacted with what. */
export function ReactionSummary({ reactions }: { reactions: Record<ReactionKind, number> }) {
  const total = REACTION_KINDS.reduce((sum, k) => sum + reactions[k], 0);
  const top = REACTION_KINDS.filter((k) => reactions[k] > 0)
    .sort((a, b) => reactions[b] - reactions[a])
    .slice(0, 3);
  const spoken = REACTION_KINDS.filter((k) => reactions[k] > 0)
    .map((k) => `${reactions[k]} ${REACTION_LABEL[k]}`)
    .join(', ');
  return (
    <span
      role="img"
      aria-label={total === 0 ? 'No reactions yet' : `${plural(total, 'reaction')}: ${spoken}`}
      className="inline-flex items-center gap-1.5 text-caption font-semibold text-text-secondary"
    >
      {top.length > 0 && (
        <span className="flex -space-x-1.5">
          {top.map((k) => (
            <span key={k} className="inline-flex rounded-pill bg-surface ring-2 ring-surface">
              <ReactionArt kind={k} />
            </span>
          ))}
        </span>
      )}
      <span className="font-mono text-metadata">{total}</span>
    </span>
  );
}

/**
 * The reaction controls on a Post Card: one tap gives a Yo (or takes back whatever you gave), and the face button opens the
 * other four. Each person has one reaction per card; picking another switches it, picking yours again takes it back.
 */
export function ReactionBar({
  reactions,
  mine,
  onReact,
}: {
  reactions: Record<ReactionKind, number>;
  mine: ReactionKind | null;
  /** A kind to give or switch to, or `null` to take yours back. */
  onReact: (kind: ReactionKind | null) => void;
}) {
  const shown = mine ?? 'yo';
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-pressed={mine !== null}
        onClick={() => onReact(mine ? null : 'yo')}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-pill border pr-3.5 pl-2.5 text-caption font-semibold transition duration-150',
          'active:translate-y-0.5 motion-reduce:active:translate-y-0',
          mine
            ? 'border-accent bg-warning text-on-warning shadow-clay-pressed'
            : 'border-border bg-surface text-text-primary shadow-clay-sm',
        )}
      >
        <span aria-hidden="true" className={cn('inline-flex', mine && 'animate-yo-pop')}>
          <ReactionArt kind={shown} className="size-6" />
        </span>
        {REACTION_LABEL[shown]}
      </button>
      <Popover
        label="Reactions"
        closeOnPick
        className="rounded-lg p-2"
        trigger={(t) => (
          <button
            type="button"
            aria-label="More reactions"
            title="More reactions"
            className="inline-flex size-11 items-center justify-center rounded-pill text-title text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
            {...t}
          >
            <ReactIcon />
          </button>
        )}
      >
        <div role="group" aria-label="Pick a reaction" className="flex gap-1">
          {REACTION_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={mine === k}
              onClick={() => onReact(mine === k ? null : k)}
              className={cn(
                'flex w-14 flex-col items-center gap-0.5 rounded-md py-1.5 text-metadata font-semibold text-text-secondary transition',
                'hover:bg-surface-sunken hover:text-text-primary aria-pressed:bg-warning aria-pressed:text-on-warning',
              )}
            >
              <ReactionArt kind={k} className="size-8" />
              {REACTION_LABEL[k]}
            </button>
          ))}
        </div>
      </Popover>
      <ReactionSummary reactions={reactions} />
    </div>
  );
}
