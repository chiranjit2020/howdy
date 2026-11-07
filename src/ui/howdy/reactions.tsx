'use client';

import { REACTIONS } from '@/shared/reactions';
import { REACTION_KINDS, type ReactionKind } from '@/shared/validation/fence';
import { ReactionEmoji } from '../art/emoji';
import { cn } from '../cn';
import { HeartFillIcon, HeartIcon } from '../icons';

export const REACTION_LABEL = Object.fromEntries(
  REACTION_KINDS.map((k) => [k, REACTIONS[k].label]),
) as Record<ReactionKind, string>;

export function ReactionArt({ kind, className }: { kind: ReactionKind; className?: string }) {
  return <ReactionEmoji kind={kind} {...(className ? { className } : {})} />;
}

/**
 * A post's reaction (2026-11-07): one outline heart and the count, like Reply beside it. The old Yo button, emoji picker
 * and stacked emoji discs confused people (two buttons, a wave that said nothing), so a post now has one clear gesture.
 * Older reactions of other kinds still count and still show your heart filled; tapping it takes yours back.
 * Without `onReact` (you may not react here) it is the count alone, not a button.
 */
export function LoveButton({
  reactions,
  mine,
  onReact,
}: {
  reactions: Record<ReactionKind, number>;
  mine: ReactionKind | null;
  /** Give a Love, or `null` to take yours back. */
  onReact?: (kind: ReactionKind | null) => void;
}) {
  const total = REACTION_KINDS.reduce((sum, k) => sum + reactions[k], 0);
  const given = mine !== null;
  const Icon = given ? HeartFillIcon : HeartIcon;
  const heart = (
    <span
      aria-hidden="true"
      className={cn('inline-flex text-[1.25rem]', given && 'animate-yo-pop text-love')}
    >
      <Icon />
    </span>
  );
  // A bare "0" says nothing: the count shows once someone has reacted.
  const count = total > 0 && <span className="tabular-nums">{total}</span>;
  const look = 'inline-flex items-center gap-1.5 text-caption font-semibold';
  if (!onReact) {
    if (total === 0) return null;
    return (
      <span
        role="img"
        className={cn(look, 'text-text-secondary')}
        aria-label={`${total} ${total === 1 ? 'Love' : 'Loves'}`}
      >
        {heart}
        {count}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={given}
      aria-label={`Love${total > 0 ? `, ${total}` : ''}`}
      title={given ? 'Take back your Love' : 'Love'}
      onClick={() => onReact(given ? null : 'love')}
      className={cn(
        look,
        // Same size and shape as Reply: a ghost pill that greys on hover. -ml-3 puts the heart on the text edge above it;
        // the hover pill still has its padding, reaching into the card's margin.
        '-ml-3 min-h-11 rounded-pill px-3 transition-colors duration-150 hover:bg-surface-sunken pointer-fine:min-h-8',
        given ? 'text-love' : 'text-text-primary',
      )}
    >
      {heart}
      {count}
    </button>
  );
}
