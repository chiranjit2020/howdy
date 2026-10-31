import { profileDetails } from '@db/schema';
import { eq } from 'drizzle-orm';
import { relationshipOf } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { enforceRateLimit } from '@/platform/rate-limit';
import {
  birthdayLabel,
  DEFAULT_DETAIL_AUDIENCE,
  DETAIL_KEYS,
  RELATIONSHIP_LABEL,
  type DetailAudience,
  type DetailKey,
  type Relationship,
  type UpdateDetails,
} from '@/shared/validation/details';
import { RATE } from './service';

/** One detail as a profile shows it: already worded ("12 March", "In a relationship"). The owner also gets its audience. */
export interface DetailLine {
  key: DetailKey;
  text: string;
  audience?: DetailAudience;
}

/** Your own details, for editing: every value (null = not set) and every audience. */
export interface MyDetails {
  livesIn: string | null;
  hometown: string | null;
  work: string | null;
  education: string | null;
  languages: string | null;
  birthday: { day: number; month: number } | null;
  relationship: Relationship | null;
  audience: Record<DetailKey, DetailAudience>;
}

type Row = typeof profileDetails.$inferSelect;

const AUDIENCE_COLUMN = {
  livesIn: 'livesInAudience',
  hometown: 'hometownAudience',
  work: 'workAudience',
  education: 'educationAudience',
  birthday: 'birthdayAudience',
  languages: 'languagesAudience',
  relationship: 'relationshipAudience',
} as const satisfies Record<DetailKey, keyof Row>;

function toMine(row: Row | undefined): MyDetails {
  const audience = Object.fromEntries(
    DETAIL_KEYS.map((k) => [k, (row?.[AUDIENCE_COLUMN[k]] as DetailAudience) ?? DEFAULT_DETAIL_AUDIENCE]),
  ) as Record<DetailKey, DetailAudience>;
  return {
    livesIn: row?.livesIn ?? null,
    hometown: row?.hometown ?? null,
    work: row?.work ?? null,
    education: row?.education ?? null,
    languages: row?.languages ?? null,
    birthday:
      row?.birthdayDay != null && row.birthdayMonth != null
        ? { day: row.birthdayDay, month: row.birthdayMonth }
        : null,
    relationship: (row?.relationship as Relationship | null) ?? null,
    audience,
  };
}

/** Each set detail, worded for showing, in the card's order. */
function lines(d: MyDetails): DetailLine[] {
  const text: Record<DetailKey, string | null> = {
    livesIn: d.livesIn,
    hometown: d.hometown,
    work: d.work,
    education: d.education,
    birthday: d.birthday ? birthdayLabel(d.birthday) : null,
    languages: d.languages,
    relationship: d.relationship ? RELATIONSHIP_LABEL[d.relationship] : null,
  };
  return DETAIL_KEYS.flatMap((key) =>
    text[key] ? [{ key, text: text[key], audience: d.audience[key] }] : [],
  );
}

async function readRow(userId: string): Promise<Row | undefined> {
  const [row] = await getDb().select().from(profileDetails).where(eq(profileDetails.userId, userId)).limit(1);
  return row;
}

/** Your own details, for the edit form (and your data export). */
export async function myDetails(userId: string): Promise<MyDetails> {
  return toMine(await readRow(userId));
}

/**
 * The details `viewerId` may see on `ownerId`'s profile, decided now: the owner sees all (with each audience); anyone else
 * sees "members" details if signed in, "posse" ones only as a friend, "only_me" never; a signed-out visitor sees none.
 * Call it only for a profile the viewer may open (the page has checked); a block either way also gives nothing here.
 */
export async function detailsForViewer(viewerId: string | null, ownerId: string): Promise<DetailLine[]> {
  const row = await readRow(ownerId);
  if (!row) return [];
  const all = lines(toMine(row));
  if (viewerId === ownerId) return all;
  if (!viewerId) return [];
  const relationship = await relationshipOf(ownerId, viewerId);
  if (relationship === 'BLOCKED') return [];
  const friend = relationship === 'POSSE' || relationship === 'CLOSE_POSSE';
  return all
    .filter((l) => l.audience === 'members' || (l.audience === 'posse' && friend))
    .map(({ key, text }) => ({ key, text }));
}

/** Change your own details and their audiences (only what is given; null clears a detail). Returns them all. */
export async function updateMyDetails(userId: string, input: UpdateDetails): Promise<MyDetails> {
  await enforceRateLimit(`profiles:details:${userId}`, RATE.edit);
  const set: Partial<typeof profileDetails.$inferInsert> = { updatedAt: new Date() };
  for (const k of ['livesIn', 'hometown', 'work', 'education', 'languages'] as const) {
    if (input[k] !== undefined) set[k] = input[k];
  }
  if (input.birthday !== undefined) {
    set.birthdayDay = input.birthday?.day ?? null;
    set.birthdayMonth = input.birthday?.month ?? null;
  }
  if (input.relationship !== undefined) set.relationship = input.relationship;
  for (const k of DETAIL_KEYS) {
    const a = input.audience?.[k];
    if (a) set[AUDIENCE_COLUMN[k]] = a;
  }
  await getDb()
    .insert(profileDetails)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: profileDetails.userId, set });
  return myDetails(userId);
}
