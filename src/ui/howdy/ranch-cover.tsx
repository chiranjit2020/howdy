import { Art } from '../art/glyph';

/**
 * The picture across the top of a Ranch: a pastel sky, rolling hills, and the clay homestead (sun, clouds, house, cactus).
 * Pure decoration, composed from the brand artwork; the same for everyone until people can choose their own cover.
 */
export function RanchCover() {
  return (
    <div
      aria-hidden="true"
      className="relative h-40 overflow-hidden bg-linear-to-b from-info to-parchment sm:h-52"
    >
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
