import type { ReactNode } from 'react';
import type { CoverPreset } from '@/shared/validation/profile';
import { Art } from '../art/glyph';
import { Img } from '../art/img';
import { cn } from '../cn';

/** Howdy's own covers other than the illustration: palette gradients (whole class names, so Tailwind keeps them). */
const GRADIENT: Record<Exclude<CoverPreset, 'porch'>, string> = {
  sunflower: 'bg-linear-to-br from-primary-soft via-primary to-primary-hover',
  dusk: 'bg-linear-to-br from-primary-mark via-accent-hover to-mystery',
  meadow: 'bg-linear-to-br from-success via-info to-parchment',
  lilac: 'bg-linear-to-br from-mystery via-accent-soft to-info',
  sunrise: 'bg-linear-to-br from-primary via-mystery to-info',
};

/**
 * The picture across the top of a Ranch (ADR-051): the owner's cover photo when they have one (and this viewer may see it),
 * otherwise their Howdy cover — the illustrated porch (the default) or a palette gradient. Decoration only; `action` (the
 * owner's "Change cover") sits on top and stays reachable.
 */
export function RanchCover({
  preset = 'porch',
  photoUrl,
  action,
  className,
}: {
  preset?: CoverPreset;
  photoUrl?: string | null | undefined;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative h-40 overflow-hidden sm:h-52', className)}>
      <div aria-hidden="true" className="absolute inset-0">
        {photoUrl ? (
          <Img src={photoUrl} alt="" width={1600} height={560} className="size-full object-cover" />
        ) : preset === 'porch' ? (
          <PorchScene />
        ) : (
          <div className={cn('size-full', GRADIENT[preset])} />
        )}
      </div>
      {action && <div className="absolute top-3 right-3">{action}</div>}
    </div>
  );
}

/**
 * A Howdy cover as a small swatch, for choosing one. The porch is drawn as its sky and hills only (the artwork does not
 * shrink to a thumbnail).
 */
export function CoverSwatch({ preset }: { preset: CoverPreset }) {
  if (preset !== 'porch') return <div aria-hidden="true" className={cn('size-full', GRADIENT[preset])} />;
  return (
    <div aria-hidden="true" className="relative size-full bg-linear-to-b from-info to-parchment">
      <svg
        viewBox="0 0 800 160"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-3/4 w-full fill-success/60"
      >
        <path d="M0 70C110 10 230 20 340 70S570 120 680 60C730 34 770 30 800 40V160H0Z" />
      </svg>
      <svg
        viewBox="0 0 800 80"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-1/3 w-full fill-accent/50"
      >
        <path d="M0 40C150 10 300 30 450 50S700 60 800 30V80H0Z" />
      </svg>
    </div>
  );
}

/** The default cover: a pastel sky, rolling hills, and the clay homestead (sun, clouds, house, cactus). */
function PorchScene() {
  return (
    <div className="relative size-full bg-linear-to-b from-info to-parchment">
      <Art name="sun" size="free" className="absolute top-4 left-[56%] w-16 sm:w-20" />
      <Art name="cloud" size="free" className="absolute top-5 left-[8%] w-20 sm:w-28" />
      <Art name="cloud" size="free" className="absolute top-14 left-[38%] w-12 opacity-90 sm:w-16" />
      {/* Three layers of hills, back to front. Stretched to the width, so the curves always run edge to edge. */}
      <svg
        viewBox="0 0 800 160"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-28 w-full fill-success/60 sm:h-36"
      >
        <path d="M0 70C110 10 230 20 340 70S570 120 680 60C730 34 770 30 800 40V160H0Z" />
      </svg>
      <svg
        viewBox="0 0 800 120"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-20 w-full fill-auth-blob-peach sm:h-24"
      >
        <path d="M0 60C120 100 250 90 380 50S650 10 800 60V120H0Z" />
      </svg>
      <svg
        viewBox="0 0 800 80"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-10 w-full fill-accent/50 sm:h-14"
      >
        <path d="M0 40C150 10 300 30 450 50S700 60 800 30V80H0Z" />
      </svg>
      <Art name="house" size="free" className="absolute right-[24%] bottom-2 w-28 sm:w-36" />
      <Art name="cactus" size="free" className="absolute right-3 bottom-1 w-14 sm:right-6 sm:w-20" />
    </div>
  );
}
