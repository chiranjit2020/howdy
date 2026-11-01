import type { MarkKind } from '@/shared/validation/marks';
import { cn } from '../cn';

/**
 * The five words friends can pick to describe someone (ADR-052): personality traits, never reactions to a post. Their
 * names, what each means, and their picture — one catalogue for the picker and the profile's "Friends say".
 */
export const MARK_LABEL: Record<MarkKind, string> = {
  gem: 'Gem',
  pure: 'Pure',
  chill: 'Chill',
  sharp: 'Sharp',
  bold: 'Bold',
};

export const MARK_MEANING: Record<MarkKind, string> = {
  gem: 'Rare, genuinely valuable',
  pure: 'Kind, trustworthy',
  chill: 'Calm, easygoing',
  sharp: 'Smart, insightful',
  bold: 'Confident, courageous',
};

export const MARK_ORDER: MarkKind[] = ['gem', 'pure', 'chill', 'sharp', 'bold'];

export const MARK_EMOJI: Record<MarkKind, string> = {
  gem: '💎',
  pure: '🤍',
  chill: '😎',
  sharp: '🧠',
  bold: '🔥',
};

/** A word's emoji (the device's own, as plain text). Decorative: its name is always written beside it. */
export function MarkIcon({ kind, className }: { kind: MarkKind; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('shrink-0 text-body leading-none', className)}>
      {MARK_EMOJI[kind]}
    </span>
  );
}
