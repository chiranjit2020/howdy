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
    // Android builds the opening screen from these: the top bar's blue with the icon in the middle (2026-11-08). The
    // app's own opening screen (LaunchScreen) then continues it with the wordmark.
    background_color: '#0187df',
    theme_color: '#0187df',
    categories: ['social'],
    // The smiling speech bubble on blue. The maskable one keeps the bubble inside the middle 80%, so Android's
    // circle or squircle crop never cuts it.
    icons: [
      { src: '/icons/howdy-bubble-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/howdy-bubble-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/howdy-bubble-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
