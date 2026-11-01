import type { MetadataRoute } from 'next';

/** The public pages, the only ones robots.ts lets search engines list. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return ['/welcome', '/community-guidelines', '/privacy', '/terms', '/cookies'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === '/welcome' ? 'weekly' : 'monthly',
    priority: path === '/welcome' ? 1 : 0.5,
  }));
}
