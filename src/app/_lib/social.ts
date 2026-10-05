import { getPortraitVersions } from '@/modules/media';
import { getCards, resolveHandle, viewableRanches, type PersonCard } from '@/modules/profiles';
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

/**
 * Portrait addresses for the people in a list, by handle, but ONLY for those whose Porch the viewer may open: the same
 * rule the Portrait route applies, decided per viewer and per person. Leaving everyone else out (rather than giving an
 * address that would 404) means a list never reveals who has a photo behind a hidden Porch. Best-effort: if anything
 * fails, the map is empty and initials show.
 */
export async function portraitsFor(viewerId: string, handles: string[]): Promise<Map<string, string>> {
  try {
    const viewable = await viewableRanches(viewerId, handles);
    const versions = await getPortraitVersions([...viewable.values()], { userId: viewerId });
    const out = new Map<string, string>();
    for (const [handle, id] of viewable) {
      const version = versions.get(id);
      if (version) out.set(handle, portraitUrl(handle, version));
    }
    return out;
  } catch {
    return new Map();
  }
}

/**
 * Fill in `portraitUrl` on every person in `people` whose Portrait `viewerId` may see (see `portraitsFor`); everyone else
 * keeps their initials. Signed out, nobody's photo shows (the Portrait route needs a session), so nothing is looked up.
 */
export async function attachPortraits(
  viewerId: string | undefined,
  people: { handle: string; portraitUrl?: string }[],
): Promise<void> {
  if (!viewerId || people.length === 0) return;
  const urls = await portraitsFor(
    viewerId,
    people.map((p) => p.handle),
  );
  for (const p of people) {
    const url = urls.get(p.handle);
    if (url) p.portraitUrl = url;
  }
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
export async function withCards(rel: MyRelationships, viewerId: string): Promise<RelationshipLists> {
  const keys = ['posse', 'incoming', 'outgoing', 'scouting', 'blocked', 'muted', 'restricted'] as const;
  const palIds = rel.posse.map((p) => p.userId);
  const [cards, photos] = await Promise.all([
    getCards(keys.flatMap((k) => rel[k].map((p) => p.userId))),
    // Best-effort: a problem here just means initials show.
    getPortraitVersions(palIds, { userId: viewerId }).catch(() => new Map<string, string>()),
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
