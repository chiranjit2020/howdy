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
    description: 'A small-circle social world.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8f5ee',
    theme_color: '#f8f5ee',
    categories: ['social'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
