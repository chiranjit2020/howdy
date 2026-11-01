import type { MetadataRoute } from 'next';

/**
 * Search engines may list the welcome page and the legal pages, and nothing else: profiles, invites and everything
 * behind sign-in stay out of search (a profile's own visibility setting is never second-guessed by a crawler).
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return {
    rules: {
      userAgent: '*',
      allow: ['/welcome', '/privacy', '/terms', '/cookies', '/community-guidelines'],
      disallow: ['/'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
