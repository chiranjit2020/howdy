import { z } from 'zod';
import { hasDisguisingChars, hasLink, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/**
 * Personal details on a profile (all optional): where you live and are from, work, education, birthday (day and month,
 * never the year), languages, relationship status, and ways to reach you (website, contact email, phone, social
 * handles; ADR-058). Each has its own audience (the social handles share one), decided on the server every time the
 * profile is read. Browser-safe; the server validates with the same schemas.
 */

/** Every detail that has its own audience, in the order a profile shows them. */
export const DETAIL_KEYS = [
  'livesIn',
  'hometown',
  'work',
  'education',
  'birthday',
  'languages',
  'relationship',
  'website',
  'email',
  'phone',
  'socials',
] as const;
export type DetailKey = (typeof DETAIL_KEYS)[number];

/** The free-text details (the rest are a date, a choice, or a way to reach you). */
export const TEXT_DETAILS = ['livesIn', 'hometown', 'work', 'education', 'languages'] as const;
export type TextDetail = (typeof TEXT_DETAILS)[number];

/** Social sites a handle may be given for. Howdy builds the link itself, so it can only ever point at the real site. */
export const SOCIALS = ['instagram', 'linkedin', 'x', 'youtube', 'facebook'] as const;
export type Social = (typeof SOCIALS)[number];

export const SOCIAL_LABEL: Record<Social, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  youtube: 'YouTube',
  facebook: 'Facebook',
};

/** Each site: what a handle may look like, the site's own hosts (to take a handle out of a pasted link) and its link. */
const SOCIAL_RULE: Record<
  Social,
  { pattern: RegExp; hosts: string[]; path?: RegExp; url: (h: string) => string }
> = {
  instagram: {
    pattern: /^[A-Za-z0-9._]{1,30}$/,
    hosts: ['instagram.com'],
    url: (h) => `https://www.instagram.com/${h}/`,
  },
  linkedin: {
    pattern: /^[A-Za-z0-9-]{3,100}$/,
    hosts: ['linkedin.com'],
    path: /^\/in\/([^/]+)/,
    url: (h) => `https://www.linkedin.com/in/${h}/`,
  },
  x: {
    pattern: /^[A-Za-z0-9_]{1,15}$/,
    hosts: ['x.com', 'twitter.com'],
    url: (h) => `https://x.com/${h}`,
  },
  youtube: {
    pattern: /^[A-Za-z0-9._-]{3,30}$/,
    hosts: ['youtube.com'],
    path: /^\/@([^/]+)/,
    url: (h) => `https://www.youtube.com/@${h}`,
  },
  facebook: {
    pattern: /^[A-Za-z0-9.]{5,50}$/,
    hosts: ['facebook.com', 'fb.com'],
    url: (h) => `https://www.facebook.com/${h}`,
  },
};
/** The same patterns for the database's checks (Postgres regex syntax is the same for these). */
export const SOCIAL_PATTERN: Record<Social, string> = Object.fromEntries(
  SOCIALS.map((s) => [s, SOCIAL_RULE[s].pattern.source]),
) as Record<Social, string>;

export const socialUrl = (site: Social, handle: string) => SOCIAL_RULE[site].url(handle);

/**
 * A handle as typed or pasted: "@name", "name", or a link to that site ("instagram.com/name", "https://www.linkedin.com/
 * in/name/"). Anything else (another site, extra words) is returned as typed so that the pattern refuses it.
 */
export function socialHandle(site: Social, typed: string): string {
  const s = typed.trim();
  const rule = SOCIAL_RULE[site];
  const asUrl = (() => {
    try {
      return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    } catch {
      return null;
    }
  })();
  const host = asUrl?.hostname.replace(/^(www\.|m\.)/, '');
  if (asUrl && host && rule.hosts.includes(host)) {
    const m = rule.path ? rule.path.exec(asUrl.pathname) : /^\/([^/]+)/.exec(asUrl.pathname);
    return m ? decodeURIComponent(m[1]!).replace(/^@/, '') : s;
  }
  return s.replace(/^@/, '');
}

/** "example.com/portfolio": a website as it is shown, without "https://" and "www.". */
export const websiteLabel = (url: string) => {
  const u = new URL(url);
  const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
  return `${u.hostname.replace(/^www\./, '')}${path}${u.search}`;
};

/** A phone number's link: its digits, with the leading + if it has one. */
export const phoneHref = (phone: string) =>
  `tel:${phone.trim().startsWith('+') ? '+' : ''}${phone.replace(/\D/g, '')}`;

export const DETAIL_LABEL: Record<DetailKey, string> = {
  livesIn: 'Lives in',
  hometown: 'From',
  work: 'Work',
  education: 'Education',
  birthday: 'Birthday',
  languages: 'Languages',
  relationship: 'Relationship',
  website: 'Website',
  email: 'Email',
  phone: 'Phone',
  socials: 'Social profiles',
};

/**
 * Who sees a detail: other signed-in members, friends, or only you. A detail is shown only on a profile the viewer may
 * open at all, so "members" never reaches signed-out visitors, even on a profile open to everyone.
 */
export const DETAIL_AUDIENCES = ['members', 'posse', 'only_me'] as const;
export type DetailAudience = (typeof DETAIL_AUDIENCES)[number];
export const DETAIL_AUDIENCE_LABEL: Record<DetailAudience, string> = {
  members: 'Everyone on Howdy',
  posse: 'Friends',
  only_me: 'Only me',
};
/** A new detail is for friends until you say otherwise. */
export const DEFAULT_DETAIL_AUDIENCE: DetailAudience = 'posse';
/**
 * A phone number or contact email is never for everyone: friends or only you (ADR-058). A public number brings scam
 * calls and harassment, and friends can already message each other on Howdy.
 */
export const PRIVATE_DETAILS = ['email', 'phone'] as const satisfies readonly DetailKey[];
export const PRIVATE_AUDIENCES = ['posse', 'only_me'] as const satisfies readonly DetailAudience[];
export const audiencesFor = (key: DetailKey): readonly DetailAudience[] =>
  (PRIVATE_DETAILS as readonly DetailKey[]).includes(key) ? PRIVATE_AUDIENCES : DETAIL_AUDIENCES;

export const RELATIONSHIPS = ['single', 'in_relationship', 'engaged', 'married', 'complicated'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];
export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  single: 'Single',
  in_relationship: 'In a relationship',
  engaged: 'Engaged',
  married: 'Married',
  complicated: 'It’s complicated',
};

export const DETAIL_TEXT_MAX = 60;

export const MONTHS = [
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
] as const;
/** Days in each month; February has 29 (a birthday may be the 29th). */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "12 March": a birthday as it is shown (never with a year). */
export const birthdayLabel = (b: { day: number; month: number }) => `${b.day} ${MONTHS[b.month - 1]}`;

/** One free-text detail: normalised; empty clears it (null); screened like every public line. */
const detailText = (what: string) =>
  z
    .string()
    .transform(normaliseText)
    .pipe(
      z
        .string()
        .max(DETAIL_TEXT_MAX, `At most ${DETAIL_TEXT_MAX} characters.`)
        .refine((s) => !hasDisguisingChars(s), `${what} contains characters that are not allowed.`)
        .refine((s) => !hasLink(s), `Links are not allowed in ${what.toLowerCase()}.`),
    )
    .transform((s) => (s === '' ? null : s));

export const birthdaySchema = z
  .object({ day: z.number().int().min(1).max(31), month: z.number().int().min(1).max(12) })
  .refine((b) => b.day <= MONTH_DAYS[b.month - 1]!, 'That day does not exist in that month.');

const audienceSchema = z.enum(DETAIL_AUDIENCES);
const privateAudienceSchema = z.enum(
  PRIVATE_AUDIENCES,
  'A phone number or email is for friends or only you.',
);

export const WEBSITE_MAX = 200;
export const EMAIL_MAX = 254;
export const PHONE_MAX = 20;

/** Empty (after trimming) clears a detail. */
const cleared = (s: string) => s.trim() === '';

/**
 * A website: https only (a link Howdy shows must not be readable or changeable on the way), no name or password in it,
 * a real domain (not an IP address). "example.com" gets its "https://". Stored as the browser would write it, so an
 * internationalised domain is stored, and shown, in its xn-- form (no look-alike letters).
 */
const websiteSchema = z.string().transform((raw, ctx) => {
  if (cleared(raw)) return null;
  const s = raw.trim();
  if (s.length > WEBSITE_MAX || hasDisguisingChars(s) || /\s/.test(s)) {
    ctx.addIssue({ code: 'custom', message: 'That isn’t a web address Howdy can show.' });
    return z.NEVER;
  }
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'That isn’t a web address. Try example.com.' });
    return z.NEVER;
  }
  if (url.protocol !== 'https:') {
    ctx.addIssue({ code: 'custom', message: 'Use an https:// address.' });
    return z.NEVER;
  }
  if (
    url.username ||
    url.password ||
    !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(url.hostname) ||
    /^[0-9.]+$/.test(url.hostname) ||
    url.href.length > WEBSITE_MAX
  ) {
    ctx.addIssue({ code: 'custom', message: 'That isn’t a web address Howdy can show.' });
    return z.NEVER;
  }
  return url.href;
});

const emailSchema = z.string().transform((raw, ctx) => {
  if (cleared(raw)) return null;
  const s = raw.trim().toLowerCase();
  if (s.length > EMAIL_MAX || !z.email().safeParse(s).success) {
    ctx.addIssue({ code: 'custom', message: 'That isn’t an email address.' });
    return z.NEVER;
  }
  return s;
});

/** A phone number as people write it: digits, spaces, hyphens, brackets and a leading +; 7 to 15 digits. */
const phoneSchema = z.string().transform((raw, ctx) => {
  if (cleared(raw)) return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  const digits = s.replace(/\D/g, '').length;
  if (s.length > PHONE_MAX || !/^\+?[0-9 ()-]+$/.test(s) || digits < 7 || digits > 15) {
    ctx.addIssue({ code: 'custom', message: 'That isn’t a phone number. Try +91 98765 43210.' });
    return z.NEVER;
  }
  return s;
});

const handleSchema = (site: Social) =>
  z.string().transform((raw, ctx) => {
    if (cleared(raw)) return null;
    const h = socialHandle(site, raw);
    if (!SOCIAL_RULE[site].pattern.test(h)) {
      ctx.addIssue({ code: 'custom', message: `That isn’t a ${SOCIAL_LABEL[site]} username.` });
      return z.NEVER;
    }
    return h;
  });

/**
 * PATCH /api/me/details: any details (null or "" clears one) and any audiences. Unknown keys are dropped (no mass
 * assignment); at least one thing must change.
 */
export const updateDetailsSchema = z
  .object({
    livesIn: detailText('Where you live').optional(),
    hometown: detailText('Where you are from').optional(),
    work: detailText('Work').optional(),
    education: detailText('Education').optional(),
    languages: detailText('Languages').optional(),
    birthday: birthdaySchema.nullable().optional(),
    relationship: z.enum(RELATIONSHIPS).nullable().optional(),
    website: websiteSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    socials: z
      .object({
        instagram: handleSchema('instagram').nullable().optional(),
        linkedin: handleSchema('linkedin').nullable().optional(),
        x: handleSchema('x').nullable().optional(),
        youtube: handleSchema('youtube').nullable().optional(),
        facebook: handleSchema('facebook').nullable().optional(),
      })
      .optional(),
    audience: z
      .object({
        livesIn: audienceSchema.optional(),
        hometown: audienceSchema.optional(),
        work: audienceSchema.optional(),
        education: audienceSchema.optional(),
        birthday: audienceSchema.optional(),
        languages: audienceSchema.optional(),
        relationship: audienceSchema.optional(),
        website: audienceSchema.optional(),
        email: privateAudienceSchema.optional(),
        phone: privateAudienceSchema.optional(),
        socials: audienceSchema.optional(),
      })
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to change.');
export type UpdateDetails = z.infer<typeof updateDetailsSchema>;
