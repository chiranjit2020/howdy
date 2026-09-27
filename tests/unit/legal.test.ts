import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_DOCS,
  formatLegalDate,
  LEGAL_DOCS,
  LEGAL_FACTS,
  LEGAL_SLUGS,
  requiredVersion,
} from '@/shared/legal';
import {
  fillFacts,
  parseInline,
  parseLegal,
  slugify,
  type Block,
  type Inline,
} from '@/shared/legal-markdown';

const read = (slug: string) => readFileSync(path.join('content', 'legal', `${slug}.md`), 'utf8');
const SEMVER = /^\d+\.\d+\.\d+$/;
const cmp = (a: string, b: string) => {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return 0;
};
const inlinesOf = (b: Block): Inline[] =>
  b.t === 'p' || b.t === 'note' ? b.body : b.t === 'ul' ? b.items.flat() : [];

describe('the legal Markdown reader', () => {
  it('reads sections, sub-headings, paragraphs, lists and notes', () => {
    const doc = parseLegal(
      [
        'Intro line one',
        'continues here.',
        '',
        '## First part',
        '- one',
        '- two **bold**',
        '  still two',
        '',
        '### Detail',
        '> **Needs legal review:** check this.',
        '',
        '> Just a note.',
        '',
        '## First part',
        'Again.',
      ].join('\n'),
    );
    expect(doc.sections).toEqual([
      { id: 'first-part', title: 'First part' },
      { id: 'first-part-2', title: 'First part' },
    ]);
    expect(doc.blocks[0]).toEqual({ t: 'p', body: [{ t: 'text', v: 'Intro line one continues here.' }] });
    expect(doc.blocks[2]).toEqual({
      t: 'ul',
      items: [
        [{ t: 'text', v: 'one' }],
        [
          { t: 'text', v: 'two ' },
          { t: 'strong', v: 'bold' },
          { t: 'text', v: ' still two' },
        ],
      ],
    });
    expect(doc.blocks[3]).toMatchObject({ t: 'h3', id: 'detail' });
    expect(doc.blocks[4]).toMatchObject({ t: 'note', review: true });
    expect(doc.blocks[5]).toMatchObject({ t: 'note', review: false });
  });

  it('keeps only safe link targets; anything else becomes plain text', () => {
    for (const href of ['/terms', '#rights', 'https://example.com', 'mailto:a@b.co'])
      expect(parseInline(`[x](${href})`)).toEqual([{ t: 'link', v: 'x', href }]);
    for (const href of [
      'javascript:alert(1)',
      'javascript:void0',
      '//evil.example',
      'http://plain.example',
      'data:text/html,x',
    ]) {
      const parts = parseInline(`[x](${href})`);
      expect(
        parts.some((p) => p.t === 'link'),
        href,
      ).toBe(false);
      expect(parts[0]).toEqual({ t: 'text', v: 'x' });
    }
  });

  it('never passes HTML through: tags are just text', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([{ t: 'text', v: '<script>alert(1)</script>' }]);
  });

  it('fills facts and refuses an unknown one', () => {
    expect(fillFacts('Hi {{ name }}!', { name: 'Rick' })).toBe('Hi Rick!');
    expect(() => fillFacts('{{nope}}', {})).toThrow(/nope/);
  });

  it('slugs are stable, readable and unique', () => {
    const taken = new Set<string>();
    expect(slugify('Tracks and Shadow Walk', taken)).toBe('tracks-and-shadow-walk');
    expect(slugify('Moderation, reports and suspension', taken)).toBe('moderation-reports-and-suspension');
    expect(slugify('Tracks and Shadow Walk', taken)).toBe('tracks-and-shadow-walk-2');
    expect(slugify('!!!', taken)).toBe('section');
  });
});

describe('the legal documents', () => {
  it.each(LEGAL_SLUGS)('%s: has its file, valid versions and dates, and parses into sections', (slug) => {
    const meta = LEGAL_DOCS[slug];
    expect(meta.slug).toBe(slug);
    expect(existsSync(path.join('content', 'legal', `${slug}.md`))).toBe(true);
    expect(meta.version).toMatch(SEMVER);
    if (meta.acceptVersion) {
      expect(meta.acceptVersion).toMatch(SEMVER);
      expect(cmp(meta.acceptVersion, meta.version)).toBeLessThanOrEqual(0); // cannot require a version not yet published
    }
    expect(meta.effective <= meta.updated).toBe(true);
    const doc = parseLegal(fillFacts(read(slug), LEGAL_FACTS));
    expect(doc.sections.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(doc)).not.toContain('{{');
  });

  it.each(LEGAL_SLUGS)('%s: every link goes somewhere real', (slug) => {
    const doc = parseLegal(fillFacts(read(slug), LEGAL_FACTS));
    const anchors = new Set(doc.blocks.flatMap((b) => (b.t === 'h2' || b.t === 'h3' ? [b.id] : [])));
    const links = doc.blocks.flatMap(inlinesOf).filter((i) => i.t === 'link');
    for (const l of links) {
      if (l.href.startsWith('#')) expect(anchors, l.href).toContain(l.href.slice(1));
      else if (l.href.startsWith('/'))
        expect(LEGAL_SLUGS as readonly string[], l.href).toContain(l.href.slice(1));
      else if (l.href.startsWith('mailto:')) expect(l.href).toBe(`mailto:${LEGAL_FACTS.contactEmail}`);
    }
  });

  it('the documents a person agrees to have a required version; the others do not', () => {
    expect([...ACCEPTED_DOCS].sort()).toEqual(['privacy', 'terms']);
    for (const d of ACCEPTED_DOCS) expect(requiredVersion(d)).toMatch(SEMVER);
    expect(LEGAL_DOCS['campfire-rules'].acceptVersion).toBeUndefined();
    expect(LEGAL_DOCS.cookies.acceptVersion).toBeUndefined();
  });

  it('the Cookie Policy names exactly the cookies the code sets', async () => {
    const text = read('cookies');
    const { THEME_COOKIE } = await import('@/ui/theme');
    expect(text).toContain('`__Host-howdy_session`');
    expect(text).toContain(`\`${THEME_COOKIE}\``);
    // only two cookie names, in backticks, that look like cookies
    const named = new Set(text.match(/`(__Host-)?howdy_[a-z_]+`/g));
    expect(named.size).toBe(2);
  });

  it('the Privacy Policy states the retention periods the code enforces', async () => {
    const text = read('privacy');
    const day = 24 * 60 * 60 * 1000;
    const { SIGNAL_TTL_MS } = await import('@/shared/validation/profile');
    const { WHISPER_RETENTION_DAYS } = await import('@/shared/validation/whispers');
    const { RETENTION_DAYS: TRACK_DAYS } = await import('@/modules/tracks/service');
    const { READ_RETENTION_MS, UNREAD_RETENTION_MS } = await import('@/modules/notifications/service');
    expect(text).toContain(`**Signal:** ${SIGNAL_TTL_MS / 3_600_000} hours`);
    expect(text).toContain(`**Whispers:** ${WHISPER_RETENTION_DAYS} days`);
    expect(text).toContain(`**Tracks:** ${TRACK_DAYS} days`);
    expect(text).toContain(
      `**Chimes:** ${READ_RETENTION_MS / day} days after you read them, or ${UNREAD_RETENTION_MS / day} days`,
    );
  });

  it('dates read like people write them', () => {
    expect(formatLegalDate('2026-09-27')).toBe('27 September 2026');
    expect(formatLegalDate('2027-01-05')).toBe('5 January 2027');
  });
});
