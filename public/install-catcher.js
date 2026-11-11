/*
 * Chrome's install offer (`beforeinstallprompt`) comes ONCE, early in the load: on a slow phone often before the app's
 * own code runs, so a listener added later never hears it and "Install Howdy" fell back to a hint (found on a Poco
 * phone, 2026-11-11). Loaded before anything else (RootLayout, next/script beforeInteractive): it keeps the offer on
 * `window.__howdyInstall` and fires `howdy:installoffer` when it arrives or is used up (src/ui/pwa/pwa.ts reads it).
 */
(function (w) {
  w.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // keep it for Howdy's own button
    w.__howdyInstall = e;
    w.dispatchEvent(new Event('howdy:installoffer'));
  });
  w.addEventListener('appinstalled', function () {
    w.__howdyInstall = null;
    w.dispatchEvent(new Event('howdy:installoffer'));
  });
})(window);
