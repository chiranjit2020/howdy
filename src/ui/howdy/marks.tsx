import type { MarkKind } from '@/shared/validation/marks';
import { Art, type ArtName } from '../art/glyph';
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

const MARK_ART: Record<MarkKind, ArtName> = {
  gem: 'mark-gem',
  pure: 'mark-pure',
  chill: 'mark-chill',
  sharp: 'mark-sharp',
  bold: 'mark-bold',
};

/** A word's picture. Decorative: its name is always written beside it. */
export function MarkIcon({ kind, className }: { kind: MarkKind; className?: string }) {
  return <Art name={MARK_ART[kind]} size="free" className={cn('size-5 shrink-0', className)} />;
}
