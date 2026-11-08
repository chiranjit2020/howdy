/**
 * Howdy's opening screen (`.launch-screen` in tokens.css): the top bar's blue, where the speech bubble rises and settles
 * into the full logo as the wordmark fades in under it, then the screen fades into the page.
 *
 * Shown in two places: the installed app on every launch, and a desktop browser on the first page load of a visit
 * (`firstLoad`, from the proxy's session cookie; like Facebook's). In the installed app it picks up from the phone's
 * own splash (Android: the bubble icon on the manifest blue; iPhone: /splash/*.png, the bubble alone): its first frame
 * puts the bubble where that splash left it, so the two read as one animation (2026-11-08).
 *
 * Two pictures, cut from the stacked logo at the same width, so stacked they are the logo again
 * (.dev/make-launch-assets.mjs). Plain <img>s: they must paint with the first HTML, before any script, so they cannot
 * wait for the lazy Img wrapper. Purely decorative, so screen readers skip it and it never takes a click.
 */
export function LaunchScreen({ firstLoad = false }: { firstLoad?: boolean }) {
  return (
    <div className="launch-screen" data-first-load={firstLoad || undefined} aria-hidden="true">
      <div className="launch-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/launch-bubble.webp" width={400} height={313} alt="" className="launch-bubble" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/launch-word.webp" width={400} height={154} alt="" className="launch-word" />
      </div>
    </div>
  );
}
