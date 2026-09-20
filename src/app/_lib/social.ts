import { getCards, resolveHandle, type PersonCard } from '@/modules/profiles';
import type { MyRelationships, PersonRef } from '@/modules/relationships';
import { AppError } from '@/platform/errors';

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
  at: string;
  closeByMe?: boolean;
}

export type RelationshipLists = Record<
  'posse' | 'incoming' | 'outgoing' | 'scouting' | 'blocked' | 'muted' | 'restricted',
  PersonEntry[]
> & {
  truncated: boolean;
};

/** Attach names to every list, dropping people whose account is no longer active. */
export async function withCards(rel: MyRelationships): Promise<RelationshipLists> {
  const keys = ['posse', 'incoming', 'outgoing', 'scouting', 'blocked', 'muted', 'restricted'] as const;
  const cards = await getCards(keys.flatMap((k) => rel[k].map((p) => p.userId)));
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
      if (r.closeByMe !== undefined) e.closeByMe = r.closeByMe;
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
