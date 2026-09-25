import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Howdy',
    short_name: 'Howdy',
    description: 'A small-circle social world.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8f5ee',
    theme_color: '#f8f5ee',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
