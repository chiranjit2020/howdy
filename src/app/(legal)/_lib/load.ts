import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { getEnv } from '@/platform/config/env';
import { LEGAL_DOCS, LEGAL_FACTS, type LegalSlug } from '@/shared/legal';
import { fillFacts, parseLegal, type ParsedDoc } from '@/shared/legal-markdown';

const cache = new Map<LegalSlug, ParsedDoc>();

/**
 * A legal document, read from `content/legal/<slug>.md` once per server and kept. The files ship with the server
 * because `outputFileTracingIncludes` in next.config.ts names them (they are read at runtime, not imported).
 */
export function loadLegal(slug: LegalSlug): ParsedDoc {
  let doc = cache.get(slug);
  if (!doc) {
    const src = readFileSync(path.join(process.cwd(), 'content', 'legal', `${slug}.md`), 'utf8');
    doc = parseLegal(fillFacts(src, LEGAL_FACTS));
    cache.set(slug, doc);
  }
  return doc;
}

/** Title, description, canonical URL and link-preview cards for a legal page. These pages are meant to be found. */
export function legalMetadata(slug: LegalSlug): Metadata {
  const doc = LEGAL_DOCS[slug];
  const base = new URL(getEnv().APP_URL);
  return {
    title: doc.title,
    description: doc.description,
    metadataBase: base,
    alternates: { canonical: `/${slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'article',
      siteName: 'Howdy',
      title: `${doc.title} · Howdy`,
      description: doc.description,
      url: `/${slug}`,
    },
    twitter: { card: 'summary', title: `${doc.title} · Howdy`, description: doc.description },
  };
}
