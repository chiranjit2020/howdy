import type { MetadataRoute } from 'next';

/**
 * The install manifest. `id`/`scope` make the installed app one stable thing; the maskable icon lets Android draw it in its
 * own shape; together with the service worker (/sw.js) this is what makes Chrome offer "Install" (ADR-022).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Howdy',
    short_name: 'Howdy',
    description: 'Social media for people you actually know.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Android builds its splash from these: the top bar's blue with the icon in the middle. The app's LaunchScreen
    // then picks up the bubble from where that splash leaves it and settles it into the full logo (2026-11-08).
    background_color: '#0187df',
    theme_color: '#0187df',
    categories: ['social'],
    // Howdy names ITSELF as its related app, so a Chrome tab can ask whether Howdy is already installed on this phone
    // (navigator.getInstalledRelatedApps, ui/pwa/pwa.ts): if it is, Home's "Get the Howdy app" bar goes away instead
    // of offering an install Chrome will not make (found on a Poco phone, 2026-11-11). Never preferred over the site.
    related_applications: [
      { platform: 'webapp', url: `${process.env.APP_URL ?? 'http://localhost:3000'}/manifest.webmanifest` },
    ],
    prefer_related_applications: false,
    // "any": the bubble on a TRANSPARENT background (2026-11-08). The old blue-square icon showed a faint outline on
    // the splash when the phone drew its blue a shade off the background's. Maskable (the home-screen icon) keeps its
    // blue, as Android fills the whole shape with it, with the bubble inside the middle 80% so no crop cuts it.
    icons: [
      { src: '/icons/howdy-bubble-clear-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/howdy-bubble-clear-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/howdy-bubble-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
