import { z } from 'zod';
import { hasDisguisingChars, hasLink, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/**
 * Personal details on a profile (all optional): where you live and are from, work, education, birthday (day and month,
 * never the year), languages and relationship status. Each has its own audience, decided on the server every time the
 * profile is read. Browser-safe; the server validates with the same schemas.
 */

export const DETAIL_KEYS = [
  'livesIn',
  'hometown',
  'work',
  'education',
  'birthday',
  'languages',
  'relationship',
] as const;
export type DetailKey = (typeof DETAIL_KEYS)[number];

/** The free-text details (the rest are a date and a choice). */
export const TEXT_DETAILS = ['livesIn', 'hometown', 'work', 'education', 'languages'] as const;
export type TextDetail = (typeof TEXT_DETAILS)[number];

export const DETAIL_LABEL: Record<DetailKey, string> = {
  livesIn: 'Lives in',
  hometown: 'From',
  work: 'Work',
  education: 'Education',
  birthday: 'Birthday',
  languages: 'Languages',
  relationship: 'Relationship',
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
    audience: z
      .object({
        livesIn: audienceSchema.optional(),
        hometown: audienceSchema.optional(),
        work: audienceSchema.optional(),
        education: audienceSchema.optional(),
        birthday: audienceSchema.optional(),
        languages: audienceSchema.optional(),
        relationship: audienceSchema.optional(),
      })
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to change.');
export type UpdateDetails = z.infer<typeof updateDetailsSchema>;
