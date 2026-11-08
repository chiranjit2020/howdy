/**
 * The installed app's opening screen: the top bar's blue with the stacked logo, fading out after a moment. Hidden by CSS
 * everywhere except the installed app (see `.launch-screen` in tokens.css). Purely decorative, so screen readers skip it.
 * A plain <img>: it must paint with the first HTML, before any script, so it cannot wait for the lazy Img wrapper.
 */
export function LaunchScreen() {
  return (
    <div className="launch-screen" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/howdy-splash.png" width={588} height={686} alt="" className="h-auto w-48" />
    </div>
  );
}
