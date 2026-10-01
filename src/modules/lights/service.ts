import { porchLights } from '@db/schema';
import { and, desc, eq, gt, inArray, lte } from 'drizzle-orm';
import { getCards, type PersonCard } from '@/modules/profiles';
import { palsReaching } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import type { LightAudience, SwitchOnLightInput } from '@/shared/validation/lights';
import type { PortraitTint } from '@/shared/validation/profile';

/**
 * Porch Light (ADR-032): "I'm free to talk", switched on for 30 minutes to 2 hours, for all my Pals or only my Close Pals.
 * - It turns itself off: a light past its time is treated as off everywhere, and the daily job deletes the row.
 * - No history: switching off deletes the row, so nobody can see when someone was last around.
 * - Who sees it is decided when it is read (`palsReaching`): a Pal now, no block, not restricted by me, not muting me,
 *   and — for a Close-only light — someone I marked Close now. No Chime and no push: it is only seen by those who look.
 */

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
export const RATE = {
  // On, off, change the note: generous for a person, too few to flash a light at someone as a signal.
  switch: rule(30, 3600),
  read: rule(240, 60),
} as const;
/** At most this many lit Pals are listed at once. */
export const LIT_LIST_LIMIT = 50;

/** `portraitUrl` is filled in by the app layer only when the viewer may see it. */
type Person = { handle: string; displayName: string; portraitTint: PortraitTint; portraitUrl?: string };
const personOf = (c: PersonCard): Person => ({
  handle: c.handle,
  displayName: c.displayName,
  portraitTint: c.portraitTint,
});

export interface MyLight {
  audience: LightAudience;
  note: string | null;
  litAt: string;
  until: string;
}
export interface LitPal {
  pal: Person;
  note: string | null;
  until: string;
}
/** What a Pal sees on my Porch while my light is on for them. Who else can see it is never said. */
export interface LightView {
  note: string | null;
  until: string;
}

const iso = (d: Date) => d.toISOString();

/** Switch my light on (or change it while on: the time starts again from now). */
export async function switchOn(
  userId: string,
  input: SwitchOnLightInput,
  now: Date = new Date(),
): Promise<MyLight> {
  await enforceRateLimit(`light:switch:${userId}`, RATE.switch);
  const untilAt = new Date(now.getTime() + input.minutes * 60_000);
  const note = input.note ? input.note : null;
  const values = { audience: input.audience, note, litAt: now, untilAt };
  await getDb()
    .insert(porchLights)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: porchLights.userId, set: values });
  return { audience: input.audience, note, litAt: iso(now), until: iso(untilAt) };
}

/** Switch my light off. Already off is fine: the answer is the same either way. */
export async function switchOff(userId: string): Promise<void> {
  await enforceRateLimit(`light:switch:${userId}`, RATE.switch);
  await getDb().delete(porchLights).where(eq(porchLights.userId, userId));
}

/** My own light, if it is still on. */
export async function myLight(userId: string, now: Date = new Date()): Promise<MyLight | null> {
  const [row] = await getDb()
    .select()
    .from(porchLights)
    .where(and(eq(porchLights.userId, userId), gt(porchLights.untilAt, now)))
    .limit(1);
  return row
    ? {
        audience: row.audience as LightAudience,
        note: row.note,
        litAt: iso(row.litAt),
        until: iso(row.untilAt),
      }
    : null;
}

/** Of these lights' owners, whose may the viewer see? (Pals who reach them, and for Close-only, marked them Close.) */
function visibleTo(reach: Map<string, { marksMeClose: boolean }>) {
  return (row: { userId: string; audience: string }) => {
    const r = reach.get(row.userId);
    return Boolean(r && (row.audience === 'pals' || r.marksMeClose));
  };
}

/** My Pals whose light is on for me right now, most recently lit first. People who are not active are left out. */
export async function litPals(viewerId: string, now: Date = new Date()): Promise<LitPal[]> {
  await enforceRateLimit(`light:read:${viewerId}`, RATE.read);
  const reach = await palsReaching(viewerId);
  if (reach.size === 0) return [];
  const rows = await getDb()
    .select()
    .from(porchLights)
    .where(and(inArray(porchLights.userId, [...reach.keys()]), gt(porchLights.untilAt, now)))
    .orderBy(desc(porchLights.litAt))
    .limit(LIT_LIST_LIMIT * 2);
  const shown = rows.filter(visibleTo(reach));
  const cards = await getCards(shown.map((r) => r.userId));
  return shown
    .flatMap((r): LitPal[] => {
      const c = cards.get(r.userId);
      return c ? [{ pal: personOf(c), note: r.note, until: iso(r.untilAt) }] : [];
    })
    .slice(0, LIT_LIST_LIMIT);
}

/** One person's light as `viewerId` may see it (on their Porch), or null — off, not for me, or not mine to know. */
export async function lightFor(
  viewerId: string,
  ownerId: string,
  now: Date = new Date(),
): Promise<LightView | null> {
  if (viewerId === ownerId) return null;
  const reach = await palsReaching(viewerId, [ownerId]);
  if (!reach.has(ownerId)) return null;
  const [row] = await getDb()
    .select()
    .from(porchLights)
    .where(and(eq(porchLights.userId, ownerId), gt(porchLights.untilAt, now)))
    .limit(1);
  return row && visibleTo(reach)(row) ? { note: row.note, until: iso(row.untilAt) } : null;
}

/** Daily: delete lights that have gone out. They already mean nothing; this just keeps no trace of them. */
export async function purgeExpiredLights(now: Date = new Date()): Promise<{ lightsCleared: number }> {
  const gone = await getDb()
    .delete(porchLights)
    .where(lte(porchLights.untilAt, now))
    .returning({ userId: porchLights.userId });
  return { lightsCleared: gone.length };
}
