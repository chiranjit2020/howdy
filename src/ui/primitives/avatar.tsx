import type { PortraitTint } from '@/shared/validation/profile';
import { Img } from '../art/img';
import { cn } from '../cn';

const SIZE = {
  sm: 'size-8 text-metadata',
  md: 'size-10 text-caption',
  lg: 'size-16 text-title',
  xl: 'size-28 text-heading',
} as const;
const PX = { sm: 32, md: 40, lg: 64, xl: 112 } as const;

// Fills for initials (no photo). The first is everyone's default: the top bar's exact blue, `header`, with WHITE
// initials (2026-11-10, the user's call, made knowing white on it is 3.8:1, under the 4.5:1 small text normally gets).
// So the browser tests' contrast check skips `.avatar-initials` (tests/e2e/helpers.ts); every other fill keeps its
// checked pair in the design-tokens test.
const FILLS = [
  'bg-header text-on-header',
  'bg-success text-on-success',
  'bg-warning text-on-warning',
  'bg-mystery text-on-mystery',
  'bg-info text-on-info',
] as const;

/** A chosen Portrait tint (stored on the Ranch). Same accessible fills as above. */
const TINT: Record<PortraitTint, string> = {
  peach: FILLS[0],
  mint: FILLS[1],
  gold: FILLS[2],
  lavender: FILLS[3],
  sky: FILLS[4],
};

function initials(name: string): string {
  // Spread by code point so an emoji or other astral character is never cut in half.
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = (w: string | undefined) => [...(w ?? '?')][0] ?? '?';
  const letters =
    parts.length > 1 ? [first(parts[0]), first(parts[parts.length - 1])] : [...(parts[0] ?? '?')].slice(0, 2);
  return letters.join('').toUpperCase();
}

function fillFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return FILLS[h % FILLS.length]!;
}

export interface AvatarProps {
  name: string;
  src?: string | null | undefined;
  size?: keyof typeof SIZE;
  /** Show a presence dot. Presence is ephemeral and only shown where the viewer is allowed to see it. */
  online?: boolean;
  /** Portrait tint chosen by the owner. Without one, a colour is derived from the name. */
  tint?: PortraitTint | undefined;
  className?: string;
}

export function Avatar({ name, src, size = 'md', online, tint, className }: AvatarProps) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center overflow-hidden rounded-pill border-2 border-surface font-semibold shadow-clay-sm',
          SIZE[size],
          !src && (tint ? TINT[tint] : fillFor(name)),
        )}
      >
        {src ? (
          <Img src={src} alt={name} width={PX[size]} height={PX[size]} className="size-full object-cover" />
        ) : (
          <span role="img" aria-label={name} className="avatar-initials">
            {initials(name)}
          </span>
        )}
      </span>
      {online && (
        <span className="absolute right-0 bottom-0 size-3 rounded-pill border-2 border-surface bg-success">
          <span className="sr-only">Online</span>
        </span>
      )}
    </span>
  );
}
