import { cn } from '../cn';
import { Img } from './img';

/**
 * Howdy's clay artwork, cut out of the brand sticker sheet (files in /public/art), standing in for emoji. Callers keep using
 * the emoji they always did (`<Glyph emoji="🤠" />`); an emoji that has artwork shows the artwork, anything else falls back to
 * the emoji itself, so nothing ever goes missing. Always decorative: the label next to it says what it means (empty `alt`).
 * Sizes are the files' real pixel sizes; CSS scales them.
 */
const FILES = {
  bird: { w: 94, h: 91 },
  cactus: { w: 134, h: 156 },
  chat: { w: 117, h: 104 },
  cloud: { w: 128, h: 129 },
  fence: { w: 145, h: 122 },
  friends: { w: 165, h: 117 },
  hat: { w: 150, h: 116 },
  hill: { w: 167, h: 107 },
  house: { w: 192, h: 120 },
  loader: { w: 82, h: 82 },
  mailbox: { w: 98, h: 163 },
  note: { w: 87, h: 82 },
  plane: { w: 93, h: 83 },
  sparkle: { w: 65, h: 69 },
  star: { w: 96, h: 101 },
  sun: { w: 120, h: 98 },
} as const;

export type ArtName = keyof typeof FILES;

const BY_EMOJI: Record<string, ArtName> = {
  '🌵': 'cactus',
  '🪵': 'fence',
  '🤠': 'hat',
  '📮': 'mailbox',
  '🤫': 'chat',
  '🤝': 'friends',
  '🤘': 'star',
  '📜': 'note',
  '🔔': 'sparkle',
  '💎': 'sparkle',
};

const SIZE = {
  /** Beside a line of text or a button label. */
  inline: 'size-5 align-text-bottom',
  /** Inside a round badge (Chimes). */
  badge: 'size-7',
  /** The big picture above an empty state or a confirmation. */
  hero: 'size-16',
  /** No size of its own: the caller sets width and position (scenery and illustrations). */
  free: '',
} as const;

export type GlyphSize = keyof typeof SIZE;

/** A named piece of artwork (for things with no emoji twin, like the paper plane on Send). */
export function Art({
  name,
  size = 'inline',
  className,
}: {
  name: ArtName;
  size?: GlyphSize;
  className?: string;
}) {
  const { w, h } = FILES[name];
  return (
    <Img
      src={`/art/${name}.png`}
      width={w}
      height={h}
      alt=""
      className={cn('inline-block object-contain', SIZE[size], className)}
    />
  );
}

/** An emoji, drawn as clay artwork when we have it. */
export function Glyph({
  emoji,
  size = 'inline',
  className,
}: {
  emoji: string;
  size?: GlyphSize;
  className?: string;
}) {
  const name = BY_EMOJI[emoji];
  if (!name) return <span aria-hidden="true">{emoji}</span>;
  return <Art name={name} size={size} {...(className ? { className } : {})} />;
}
