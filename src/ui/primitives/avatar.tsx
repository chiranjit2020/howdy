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

// Pastel fills; every one carries dark text with >=7:1 contrast (see design-tokens test).
const FILLS = [
  'bg-accent-strong text-on-accent',
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

/**
 * Diwali lights (TEMPORARY, Diwali 2026): a ring of alternating gold and red dots round every avatar.
 * They switch themselves off at midnight India time at the end of 10 Nov 2026. To remove for good: delete this,
 * `DiwaliLights`, the `lights` prop and the two `--color-diwali-*` tokens + `twinkle`.
 */
const DIWALI_LIGHTS_UNTIL = Date.parse('2026-11-11T00:00:00+05:30');

/**
 * Read per render, not once at module load: a warm server keeps its modules for days, so a load-time check would leave
 * the lights on past the date. The answer only flips once, at midnight, so a render either side of it is harmless.
 */
function diwaliLightsOn(): boolean {
  return Date.now() < DIWALI_LIGHTS_UNTIL;
}

// Literal class names so Tailwind generates them: 24 positions, 15° apart. Smaller avatars use every other one.
const ANGLES = [
  'rotate-0',
  'rotate-[15deg]',
  'rotate-[30deg]',
  'rotate-[45deg]',
  'rotate-[60deg]',
  'rotate-[75deg]',
  'rotate-[90deg]',
  'rotate-[105deg]',
  'rotate-[120deg]',
  'rotate-[135deg]',
  'rotate-[150deg]',
  'rotate-[165deg]',
  'rotate-[180deg]',
  'rotate-[195deg]',
  'rotate-[210deg]',
  'rotate-[225deg]',
  'rotate-[240deg]',
  'rotate-[255deg]',
  'rotate-[270deg]',
  'rotate-[285deg]',
  'rotate-[300deg]',
  'rotate-[315deg]',
  'rotate-[330deg]',
  'rotate-[345deg]',
] as const;

// How far outside the avatar the ring sits, and how big each light is.
const LIGHTS = {
  sm: { ring: '-inset-[4px]', dot: 'size-[4px]', step: 2 },
  md: { ring: '-inset-[5px]', dot: 'size-[5px]', step: 2 },
  lg: { ring: '-inset-[6px]', dot: 'size-[6px]', step: 1 },
  xl: { ring: '-inset-[8px]', dot: 'size-[8px]', step: 1 },
} as const;

function DiwaliLights({ size }: { size: keyof typeof SIZE }) {
  const { ring, dot, step } = LIGHTS[size];
  const angles = ANGLES.filter((_, i) => i % step === 0);
  return (
    <span aria-hidden="true" className="pointer-events-none">
      {angles.map((angle, i) => (
        <span key={angle} className={cn('absolute', ring, angle)}>
          <span
            className={cn(
              'absolute top-0 left-1/2 -translate-x-1/2 animate-twinkle rounded-pill',
              dot,
              i % 2 === 0 ? 'bg-diwali-gold' : 'bg-diwali-red [animation-delay:0.8s]',
            )}
          />
        </span>
      ))}
    </span>
  );
}

export interface AvatarProps {
  name: string;
  src?: string | null | undefined;
  size?: keyof typeof SIZE;
  /** Show a presence dot. Presence is ephemeral and only shown where the viewer is allowed to see it. */
  online?: boolean;
  /** Portrait tint chosen by the owner. Without one, a colour is derived from the name. */
  tint?: PortraitTint | undefined;
  /** Diwali lights (temporary). Off where avatars overlap, so the rings don't run into each other. */
  lights?: boolean;
  className?: string;
}

export function Avatar({ name, src, size = 'md', online, tint, lights = true, className }: AvatarProps) {
  const showLights = lights && diwaliLightsOn();
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {/* The lights hang off this box, which is always exactly the circle (the outer span may be stretched by its row). */}
      <span className={cn('relative inline-flex', SIZE[size])}>
        {showLights && <DiwaliLights size={size} />}
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
            <span role="img" aria-label={name}>
              {initials(name)}
            </span>
          )}
        </span>
      </span>
      {online && (
        <span className="absolute right-0 bottom-0 size-3 rounded-pill border-2 border-surface bg-success">
          <span className="sr-only">Online</span>
        </span>
      )}
    </span>
  );
}
