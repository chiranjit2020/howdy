import type { ReactionKind } from './validation/fence';

/**
 * The reaction catalog (ADR-049): what each reaction is called and which emoji it is. The database stores only the kind
 * (`yos.kind`, `story_views.reaction`, …), so the picture can change without a migration; a NEW kind needs one (the
 * check constraints list the kinds). Drawn from Microsoft's Fluent Emoji (Flat), files in /public/emoji/fluent.
 */
export const REACTIONS: Record<ReactionKind, { label: string; emoji: string }> = {
  yo: { label: 'Wave', emoji: '👋' },
  laugh: { label: 'Laugh', emoji: '😂' },
  fire: { label: 'Fire', emoji: '🔥' },
  popcorn: { label: 'Popcorn', emoji: '🍿' },
  love: { label: 'Love', emoji: '❤️' },
};

/** The kind an emoji stands for, if it is one of the reactions. */
export function reactionOfEmoji(emoji: string): ReactionKind | undefined {
  return (Object.keys(REACTIONS) as ReactionKind[]).find((k) => REACTIONS[k].emoji === emoji);
}
