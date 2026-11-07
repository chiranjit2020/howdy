/**
 * A thin bar along the bottom edge of a wide photo while it uploads: it fills with the upload's real progress
 * (`progress` 0..1), or, with `progress` null, a short segment slides along it while the server finishes. Drawn in SVG
 * so the fill is an attribute, not an inline style (the CSP forbids those). Always comes with words on a button too.
 */
export function UploadBar({ progress, label }: { progress: number | null; label: string }) {
  const sliding = progress === null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(sliding ? {} : { 'aria-valuenow': Math.round(progress * 100) })}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 overflow-hidden bg-surface/70"
    >
      {sliding ? (
        <div className="h-full w-1/3 animate-bar-slide rounded-pill bg-star" />
      ) : (
        <svg
          viewBox="0 0 100 6"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="block h-full w-full"
        >
          <rect
            width={Math.max(progress, 0.02) * 100}
            height="6"
            className="fill-star transition-[width] duration-200 ease-out"
          />
        </svg>
      )}
    </div>
  );
}
