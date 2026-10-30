'use client';

import { REACTIONS } from '@/shared/reactions';
import { REACTION_KINDS, type ReactionKind } from '@/shared/validation/fence';
import { ReactionEmoji } from '../art/emoji';
import { cn } from '../cn';
import { ReactIcon } from '../icons';
import { Popover } from '../primitives/popover';

export const REACTION_LABEL = Object.fromEntries(
  REACTION_KINDS.map((k) => [k, REACTIONS[k].label]),
) as Record<ReactionKind, string>;

export function ReactionArt({ kind, className }: { kind: ReactionKind; className?: string }) {
  return <ReactionEmoji kind={kind} {...(className ? { className } : {})} />;
}

// The picker's emoji come in one after another, 30 ms apart (classes, not inline styles: the CSP forbids those).
const STAGGER = [
  '[animation-delay:0ms]',
  '[animation-delay:30ms]',
  '[animation-delay:60ms]',
  '[animation-delay:90ms]',
  '[animation-delay:120ms]',
];

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
      <span className="text-metadata tabular-nums">{total}</span>
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
  summary = true,
}: {
  reactions: Record<ReactionKind, number>;
  mine: ReactionKind | null;
  /** A kind to give or switch to, or `null` to take yours back. */
  onReact: (kind: ReactionKind | null) => void;
  /** Show the counts after the buttons. A Post Card shows them on a line of their own instead. */
  summary?: boolean;
}) {
  const shown = mine ?? 'yo';
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-pressed={mine !== null}
        // The emoji says it; the name is for screen readers and the hover tooltip only.
        aria-label={REACTION_LABEL[shown]}
        title={REACTION_LABEL[shown]}
        onClick={() => onReact(mine ? null : 'yo')}
        className={cn(
          'inline-flex size-11 items-center justify-center rounded-pill transition-colors duration-150 pointer-fine:size-8',
          // Picked: a quiet violet tint (yellow is for primary buttons). Not picked: just the emoji, grey on hover.
          mine ? 'bg-accent-soft' : 'hover:bg-surface-sunken',
        )}
      >
        <span aria-hidden="true" className={cn('inline-flex', mine && 'animate-yo-pop')}>
          <ReactionArt kind={shown} className="size-5" />
        </span>
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
            className="inline-flex size-11 items-center justify-center rounded-pill text-title text-text-secondary hover:bg-surface-sunken hover:text-text-primary pointer-fine:size-8"
            {...t}
          >
            <ReactIcon />
          </button>
        )}
      >
        <div role="group" aria-label="Pick a reaction" className="flex gap-1">
          {REACTION_KINDS.map((k, i) => (
            <button
              key={k}
              type="button"
              aria-pressed={mine === k}
              aria-label={REACTION_LABEL[k]}
              title={REACTION_LABEL[k]}
              onClick={() => onReact(mine === k ? null : k)}
              className="grid size-11 place-items-center rounded-md transition-colors hover:bg-surface-sunken aria-pressed:bg-accent-soft"
            >
              <ReactionArt kind={k} className={cn('size-7 animate-emoji-in', STAGGER[i])} />
            </button>
          ))}
        </div>
      </Popover>
      {summary && <ReactionSummary reactions={reactions} />}
    </div>
  );
}
