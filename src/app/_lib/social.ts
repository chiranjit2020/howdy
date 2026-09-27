import { getPortraitVersions } from '@/modules/media';
import { getCards, resolveHandle, type PersonCard } from '@/modules/profiles';
import type { MyRelationships, PersonRef } from '@/modules/relationships';
import { AppError } from '@/platform/errors';
import { portraitUrl } from '@/shared/portrait';

/**
 * Glue between modules that must not depend on each other: `relationships` speaks in user ids, `profiles` turns handles
 * into ids and ids into names. Keeping the composition here (the app layer) is what lets those two modules stay separate.
 */

/** The person a request is about, or NOT_FOUND (missing, malformed, or inactive — all the same to the caller). */
export async function targetFor(handle: string | undefined): Promise<PersonCard> {
  const person = handle ? await resolveHandle(handle) : null;
  if (!person) throw new AppError('NOT_FOUND');
  return person;
}

/** What a list entry looks like on the wire: a name and handle, never an id. */
export interface PersonEntry {
  handle: string;
  displayName: string;
  portraitTint: PersonCard['portraitTint'];
  /** Their photo, for Pals only: a Pal may always open the other's Porch, which is the rule the photo route applies. */
  portraitUrl?: string;
  at: string;
  closeByMe?: boolean;
  /** The Howdy team account (Verified badge). Present only when true. */
  verified?: true;
}

export type RelationshipLists = Record<
  'posse' | 'incoming' | 'outgoing' | 'scouting' | 'blocked' | 'muted' | 'restricted',
  PersonEntry[]
> & {
  truncated: boolean;
};

/** Attach names (and Pals' photos) to every list, dropping people whose account is no longer active. */
export async function withCards(rel: MyRelationships): Promise<RelationshipLists> {
  const keys = ['posse', 'incoming', 'outgoing', 'scouting', 'blocked', 'muted', 'restricted'] as const;
  const palIds = rel.posse.map((p) => p.userId);
  const [cards, photos] = await Promise.all([
    getCards(keys.flatMap((k) => rel[k].map((p) => p.userId))),
    // Best-effort: a problem here just means initials show.
    getPortraitVersions(palIds).catch(() => new Map<string, string>()),
  ]);
  const entries = (refs: (PersonRef & { closeByMe?: boolean })[]): PersonEntry[] =>
    refs.flatMap((r) => {
      const c = cards.get(r.userId);
      if (!c) return [];
      const e: PersonEntry = {
        handle: c.handle,
        displayName: c.displayName,
        portraitTint: c.portraitTint,
        at: r.at.toISOString(),
      };
      const photo = photos.get(r.userId);
      if (photo) e.portraitUrl = portraitUrl(c.handle, photo);
      if (r.closeByMe !== undefined) e.closeByMe = r.closeByMe;
      if (c.verified) e.verified = true;
      return [e];
    });
  return {
    posse: entries(rel.posse),
    incoming: entries(rel.incoming),
    outgoing: entries(rel.outgoing),
    scouting: entries(rel.scouting),
    blocked: entries(rel.blocked),
    muted: entries(rel.muted),
    restricted: entries(rel.restricted),
    truncated: rel.truncated,
  };
}
