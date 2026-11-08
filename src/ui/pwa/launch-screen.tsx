/**
 * Howdy's opening screen: the top bar's blue with the stacked logo, fading out after a moment. Shown by CSS (see
 * `.launch-screen` in tokens.css) in two places only: the installed app, on every launch; and a desktop browser, on the
 * first page load of a visit (`firstLoad`, from the proxy's session cookie; 2026-11-08, like Facebook's). Purely
 * decorative, so screen readers skip it and it never takes a click.
 * A plain <img>: it must paint with the first HTML, before any script, so it cannot wait for the lazy Img wrapper.
 */
export function LaunchScreen({ firstLoad = false }: { firstLoad?: boolean }) {
  return (
    <div className="launch-screen" data-first-load={firstLoad || undefined} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/howdy-splash.png" width={588} height={686} alt="" className="h-auto w-48" />
    </div>
  );
}
