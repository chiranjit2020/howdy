import Link from 'next/link';
import { LEGAL_DOCS, LEGAL_SLUGS } from '@/shared/legal';

/** The legal links at the foot of every page. Quiet on purpose: small, muted, and out of the way of the content. */
export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-border/60 py-6">
      <nav aria-label="Legal">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-caption">
          {LEGAL_SLUGS.map((slug) => (
            <li key={slug}>
              <Link
                href={`/${slug}`}
                className="inline-flex min-h-11 items-center text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
              >
                {LEGAL_DOCS[slug].short}
              </Link>
            </li>
          ))}
          <li className="text-text-secondary">© {new Date().getFullYear()} Howdy</li>
        </ul>
      </nav>
    </footer>
  );
}
