import Link from 'next/link';
import { Fragment } from 'react';
import { formatLegalDate, LEGAL_DOCS, LEGAL_SLUGS, type LegalSlug } from '@/shared/legal';
import type { Block, Inline } from '@/shared/legal-markdown';
import { cn } from '@/ui/cn';
import { Badge, ClayCard } from '@/ui/primitives';
import { loadLegal } from './load';
import { LegalContents, ReadingProgress } from './reading-aids';

/** A little picture per Campfire Rule, so the rules read as a set of friendly cards rather than a wall of text. */
const CAMPFIRE_ICON: Record<string, string> = {
  'respect-the-campfire': '🔥',
  'no-harassment': '🛑',
  'no-hate': '🤝',
  'no-doxxing': '🔒',
  'no-spam': '📭',
  'no-impersonation': '🪪',
  'respect-boundaries': '🚧',
  'keep-it-safe-and-legal': '⚖️',
  'look-after-each-other': '💛',
  'when-rules-are-broken': '🧭',
};

const LINK = 'font-medium text-link underline underline-offset-4 hover:text-text-primary';

function Text({ parts }: { parts: Inline[] }) {
  return parts.map((p, i) => {
    if (p.t === 'strong')
      return (
        <strong key={i} className="font-semibold text-text-primary">
          {p.v}
        </strong>
      );
    if (p.t === 'link') {
      // Same-site links go through the router; mail and https links are ordinary anchors.
      return p.href.startsWith('/') || p.href.startsWith('#') ? (
        <Link key={i} href={p.href} className={LINK}>
          {p.v}
        </Link>
      ) : (
        <a key={i} href={p.href} className={cn(LINK, 'break-words')}>
          {p.v}
        </a>
      );
    }
    return <Fragment key={i}>{p.v}</Fragment>;
  });
}

function BlockView({ block }: { block: Exclude<Block, { t: 'h2' }> }) {
  switch (block.t) {
    case 'h3':
      return (
        <h3 id={block.id} className="mt-2 scroll-mt-24 text-title text-text-primary">
          {block.text}
        </h3>
      );
    case 'p':
      return (
        <p className="text-body text-text-secondary">
          <Text parts={block.body} />
        </p>
      );
    case 'ul':
      return (
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-text-secondary marker:text-accent">
          {block.items.map((item, i) => (
            <li key={i}>
              <Text parts={item} />
            </li>
          ))}
        </ul>
      );
    case 'note':
      return (
        <aside
          className={cn(
            'rounded-lg border-l-4 px-4 py-3 text-caption',
            block.review
              ? 'border-warning bg-warning/15 text-text-primary'
              : 'border-mystery bg-mystery/10 text-text-primary',
          )}
        >
          <Text parts={block.body} />
        </aside>
      );
  }
}

interface Section {
  id: string;
  title: string;
  blocks: Exclude<Block, { t: 'h2' }>[];
}

/** Everything before the first `##` is the introduction; each `##` starts a section (its own card). */
function group(blocks: Block[]): { intro: Section['blocks']; sections: Section[] } {
  const intro: Section['blocks'] = [];
  const sections: Section[] = [];
  for (const b of blocks) {
    if (b.t === 'h2') sections.push({ id: b.id, title: b.text, blocks: [] });
    else (sections.at(-1)?.blocks ?? intro).push(b);
  }
  return { intro, sections };
}

/**
 * One legal page: a header with the version and dates, a table of contents (a sticky side list on wide screens, a
 * fold-out list on phones), and each section in its own card. The words come from `content/legal/<slug>.md`.
 */
export function LegalDocument({ slug }: { slug: LegalSlug }) {
  const meta = LEGAL_DOCS[slug];
  const doc = loadLegal(slug);
  const { intro, sections } = group(doc.blocks);
  const campfire = slug === 'campfire-rules';
  const others = LEGAL_SLUGS.filter((s) => s !== slug);

  return (
    <main id="main" className="mx-auto flex max-w-5xl flex-col gap-6 py-4 sm:py-8">
      <ReadingProgress />

      <ClayCard className={cn('flex flex-col gap-3 sm:p-8', campfire && 'bg-accent-soft')}>
        <p className="text-metadata tracking-wide text-text-secondary uppercase">Howdy · Legal</p>
        <h1 className="font-display text-display text-text-primary">
          {campfire && (
            <span aria-hidden="true" className="mr-2">
              🔥
            </span>
          )}
          {meta.title}
        </h1>
        <p className="max-w-prose text-body text-text-secondary">{meta.description}</p>
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-text-secondary">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Version</dt>
            <dd>
              <Badge tone="success">Version {meta.version}</Badge>
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Effective</dt>
            <dd className="font-medium text-text-primary">
              <time dateTime={meta.effective}>{formatLegalDate(meta.effective)}</time>
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Last updated</dt>
            <dd className="font-medium text-text-primary">
              <time dateTime={meta.updated}>{formatLegalDate(meta.updated)}</time>
            </dd>
          </div>
        </dl>
      </ClayCard>

      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[13rem_minmax(0,1fr)] xl:items-start xl:gap-8">
        <LegalContents sections={doc.sections} />

        <article className="flex min-w-0 flex-col gap-5">
          {intro.length > 0 && (
            <ClayCard className="flex max-w-prose flex-col gap-4 sm:p-7">
              {intro.map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
            </ClayCard>
          )}
          {sections.map((s) => (
            <section key={s.id} aria-labelledby={s.id}>
              <ClayCard className="flex flex-col gap-4 sm:p-7">
                <h2
                  id={s.id}
                  tabIndex={-1}
                  className="flex scroll-mt-24 items-center gap-3 font-display text-heading text-text-primary focus:outline-none"
                >
                  {campfire && CAMPFIRE_ICON[s.id] && (
                    <span
                      aria-hidden="true"
                      className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-sunken text-title"
                    >
                      {CAMPFIRE_ICON[s.id]}
                    </span>
                  )}
                  <a href={`#${s.id}`} className="no-underline hover:underline hover:underline-offset-4">
                    {s.title}
                  </a>
                </h2>
                <div className="flex max-w-prose flex-col gap-4">
                  {s.blocks.map((b, i) => (
                    <BlockView key={i} block={b} />
                  ))}
                </div>
              </ClayCard>
            </section>
          ))}

          <nav aria-label="Other documents" className="flex flex-wrap gap-2 pt-2">
            {others.map((s) => (
              <Link
                key={s}
                href={`/${s}`}
                className="inline-flex min-h-11 items-center rounded-pill border border-border bg-surface px-4 text-caption text-text-primary no-underline hover:bg-surface-sunken"
              >
                {LEGAL_DOCS[s].title}
              </Link>
            ))}
          </nav>
        </article>
      </div>
    </main>
  );
}
