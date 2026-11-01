import { reactionOfEmoji } from '@/shared/reactions';
import { cn } from '../cn';
import { ReactionEmoji } from './emoji';

/*
 * The clay artwork (public/art) was removed on 2026-11-01: the app is flat now, with Octicons for its own icons. Emoji are
 * the device's own, except the reaction emoji, which stay Microsoft's flat Fluent set (./emoji.tsx).
 */

const SIZE = {
  /** Beside a line of text or a button label. */
  inline: 'size-5 align-text-bottom',
  /** Inside a round badge. */
  badge: 'size-7',
  /** The big picture above an empty state or a confirmation. */
  hero: 'size-16',
  /** No size of its own: the caller sets it. */
  free: '',
} as const;

/** Text sizes that match the picture sizes, for an emoji drawn by the device. */
const TEXT = {
  inline: 'text-body',
  badge: 'text-title',
  hero: 'text-display',
  free: '',
} as const;

export type GlyphSize = keyof typeof SIZE;

/** An emoji: a Fluent reaction emoji when it is one of the reactions, otherwise the device's own. Decorative. */
export function Glyph({
  emoji,
  size = 'inline',
  className,
}: {
  emoji: string;
  size?: GlyphSize;
  className?: string;
}) {
  const reaction = reactionOfEmoji(emoji);
  if (reaction) return <ReactionEmoji kind={reaction} className={cn(SIZE[size], className)} />;
  return (
    <span aria-hidden="true" className={cn('leading-none', TEXT[size], className)}>
      {emoji}
    </span>
  );
}
