/**
 * The legal documents: one place for their versions, dates and who runs Howdy. The words themselves live in
 * `content/legal/<slug>.md` so they can change without touching code.
 *
 * Two versions per document:
 * - `version` is what the page shows. Bump it for ANY change, even a typo (patch) or a clarification (minor).
 * - `acceptVersion` is the version a person must have agreed to. Raise it (to the new `version`) only when a change
 *   is material and people must agree again; everyone who accepted an older one is then asked once, on their next visit.
 * Keep the dates honest: `updated` is when the words last changed, `effective` when this version took effect.
 */

export const LEGAL_SLUGS = ['privacy', 'terms', 'campfire-rules', 'cookies'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

/** The documents a person must agree to (at Stake a Claim, and again when their `acceptVersion` moves). */
export const ACCEPTED_DOCS = ['terms', 'privacy'] as const;
export type AcceptedDoc = (typeof ACCEPTED_DOCS)[number];

export interface LegalDoc {
  slug: LegalSlug;
  title: string;
  /** Short name for links (footer, table of contents). */
  short: string;
  /** One sentence for search results and link previews. */
  description: string;
  version: string;
  acceptVersion?: string;
  effective: string;
  updated: string;
}

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    short: 'Privacy',
    description:
      'What Howdy collects, why, how long it is kept, who can see it, and the choices and rights you have.',
    version: '1.2.0',
    acceptVersion: '1.1.0',
    effective: '2026-09-30',
    updated: '2026-09-30',
  },
  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    short: 'Terms',
    description: 'The agreement between you and Howdy: who may use it, what you own, and what we may do.',
    version: '1.2.0',
    acceptVersion: '1.0.0',
    effective: '2026-09-30',
    updated: '2026-09-30',
  },
  'campfire-rules': {
    slug: 'campfire-rules',
    title: 'Campfire Rules',
    short: 'Campfire Rules',
    description: 'How we look after each other on Howdy: the community guidelines, in plain words.',
    version: '1.1.0',
    effective: '2026-09-29',
    updated: '2026-09-29',
  },
  cookies: {
    slug: 'cookies',
    title: 'Cookie Policy',
    short: 'Cookies',
    description: 'The two small cookies Howdy uses, what each one is for, and how to control them.',
    version: '1.0.0',
    effective: '2026-09-27',
    updated: '2026-09-27',
  },
};

/** The version of `doc` a person must have agreed to. */
export const requiredVersion = (doc: AcceptedDoc): string => LEGAL_DOCS[doc].acceptVersion!;

/** Facts the documents quote. `{{name}}` in the Markdown is replaced with these. */
export const LEGAL_FACTS = {
  operator: 'Chiranjit Karmakar',
  country: 'India',
  contactEmail: 'privacy@howdy.chiranjitkarmakar.com',
  minimumAge: '18',
  site: 'howdy.chiranjitkarmakar.com',
} as const;

/** "27 September 2026" — dates are stored as ISO days and shown the same way everywhere (no time zone surprises). */
export function formatLegalDate(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  const month = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][(m ?? 1) - 1];
  return `${d} ${month} ${y}`;
}
