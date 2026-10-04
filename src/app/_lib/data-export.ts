import { accountExport } from '@/modules/auth';
import { myCapsules } from '@/modules/capsules';
import { fenceExport, type ExportState } from '@/modules/fence';
import { marksExport } from '@/modules/marks';
import { readCardPhoto, readPortrait } from '@/modules/media';
import { moderationExport } from '@/modules/moderation';
import { getPrefs } from '@/modules/notifications';
import { getCards, getOwnRanch, type PersonCard } from '@/modules/profiles';
import { hiddenAuthors, listMyRelationships, type PersonRef } from '@/modules/relationships';
import { townHallsExport } from '@/modules/town-halls';
import { listTracks } from '@/modules/tracks';
import { tributesExport } from '@/modules/tributes';
import { whispersExport } from '@/modules/whispers';
import type { ZipEntry } from '@/platform/zip';

/**
 * "Download my data" (ADR-037): everything I gave Howdy, plus what the app already shows me, as one ZIP — `data.json`,
 * my photos, and a README. The rule that keeps it safe is the app's own: **nothing appears here that the app would not
 * show me right now.** Each module hands over its own rows with the state I see in the app (a held card looks posted to
 * its writer; a declined request still looks sent). This layer names the people, and leaves out every item that would
 * name someone I cannot see now — an account that is closed or suspended, or anyone in a block with me (or muted by
 * me), exactly as the Fence, Tributes and every list leave them out. Otherwise the file could tell someone what a block
 * or a suspension is hiding. Never in the file: anyone else's email or id, anyone's private choices about me, who gave
 * which Mark, a sealed capsule's words, read positions, push keys, or the security log.
 */

const iso = (d: Date) => d.toISOString();
const stateLabel = (s: ExportState) => (s === 'published' ? 'posted' : 'waiting for approval');

interface Person {
  callSign: string;
  name: string;
}
const personOf = (c: PersonCard): Person => ({ callSign: c.handle, name: c.displayName });

export interface DataExport {
  /** The parsed JSON (tests read it directly). */
  data: Record<string, unknown>;
  /** data.json, README.txt and the photos, in archive order. Photo bytes are read only when the ZIP is streamed. */
  entries: ZipEntry[];
}

export async function buildDataExport(userId: string, now: Date = new Date()): Promise<DataExport> {
  const [account, ranch, prefs, rel, fence, whispers, tributes, marks, capsules, tracks, halls, moderation] =
    await Promise.all([
      accountExport(userId, now),
      getOwnRanch(userId, now),
      getPrefs(userId),
      listMyRelationships(userId),
      fenceExport(userId),
      whispersExport(userId),
      tributesExport(userId),
      marksExport(userId),
      myCapsules(userId, now),
      listTracks(userId),
      townHallsExport(userId),
      moderationExport(userId),
    ]);

  // Everyone this file could name, checked once: active accounts only, and nobody hidden from me.
  const ids = new Set<string>([
    ...[rel.posse, rel.incoming, rel.outgoing, rel.scouting, rel.blocked, rel.muted, rel.restricted].flatMap(
      (l) => l.map((p) => p.userId),
    ),
    ...fence.onMyFence.flatMap((c) => [c.authorId, ...c.replies.map((r) => r.authorId)]),
    ...fence.myCardsElsewhere.map((c) => c.fenceOwnerId),
    ...fence.myRepliesElsewhere.flatMap((r) => [r.fenceOwnerId, r.cardAuthorId]),
    ...fence.myReactions.flatMap((r) => [r.fenceOwnerId, r.cardAuthorId]),
    ...whispers.threads.map((t) => t.otherId),
    ...whispers.held.map((h) => h.fromId),
    ...tributes.onMyPorch.map((t) => t.otherId),
    ...tributes.byMe.map((t) => t.otherId),
    ...marks.given.map((m) => m.targetId),
  ]);
  ids.delete(userId);
  const [cards, hidden] = await Promise.all([getCards([...ids]), hiddenAuthors(userId, [...ids])]);
  /** May this file name `id`? I may always name myself. */
  const visible = (id: string) => id === userId || (cards.has(id) && !hidden.has(id));
  const who = (id: string): Person =>
    id === userId ? { callSign: account.callSign, name: ranch.displayName } : personOf(cards.get(id)!);
  /** Lists of people as the Pals page and the Workshop show them: anyone still active (my own lists of whom I hid). */
  const people = (list: PersonRef[]) =>
    list.flatMap((p) => {
      const c = cards.get(p.userId);
      return c ? [{ ...personOf(c), since: iso(p.at) }] : [];
    });

  // Photos: mine, and the photo on any card that is in this file.
  const entries: ZipEntry[] = [];
  const photoEntries: ZipEntry[] = [];
  let portraitPath: string | null = null;
  // Read now, not when streamed: whether the file has a Portrait must be known before data.json is written.
  const portrait = await readPortrait(userId).catch(() => null);
  if (portrait) {
    portraitPath = 'photos/portrait.webp';
    photoEntries.push({ name: portraitPath, read: async () => portrait.bytes });
  }
  let n = 0;
  const cardPhoto = (photoId: string | null): string | null => {
    if (!photoId) return null;
    const path = `photos/cards/${++n}.webp`;
    photoEntries.push({ name: path, read: () => readCardPhoto(photoId).catch(() => null) });
    return path;
  };

  const onMyFence = fence.onMyFence
    .filter((c) => visible(c.authorId))
    .map((c) => ({
      from: who(c.authorId),
      words: c.body,
      state: stateLabel(c.state),
      nailedAt: iso(c.createdAt),
      photo: cardPhoto(c.photoId),
      replies: c.replies
        .filter((r) => visible(r.authorId))
        .map((r) => ({
          from: who(r.authorId),
          words: r.body,
          state: stateLabel(r.state),
          at: iso(r.createdAt),
        })),
    }));

  const data = {
    about:
      'Your Howdy data, as of the time below. Everything you gave us, plus what Howdy shows you. See README.txt.',
    exportedAt: iso(now),
    account: {
      callSign: account.callSign,
      email: account.email,
      emailConfirmedAt: account.emailConfirmedAt,
      joinedAt: account.joinedAt,
      trustedTick: ranch.trusted,
      signedInDevices: account.devices,
      agreements: account.agreements,
    },
    porch: {
      name: ranch.displayName,
      bio: ranch.bio,
      portraitColour: ranch.portraitTint,
      portrait: portraitPath,
      signal: ranch.signal ? { words: ranch.signal.text, until: iso(ranch.signal.expiresAt) } : null,
      settings: {
        whoCanOpenMyPorch: ranch.ranchVisibility,
        whoCanSeeMySignal: ranch.signalVisibility,
        whoCanReadMyFence: ranch.fenceVisibility,
        whoCanWriteOnMyFence: ranch.fencePosting,
        reviewCardsFirst: ranch.fenceReview,
        shadowWalk: ranch.shadowWalk,
        readReceipts: ranch.readReceipts,
        suggestMeToPalsOfPals: ranch.discoverable,
      },
      chimes: prefs,
    },
    pals: {
      pals: rel.posse.flatMap((p) => {
        const c = cards.get(p.userId);
        return c ? [{ ...personOf(c), since: iso(p.at), closePal: p.closeByMe }] : [];
      }),
      requestsToMe: people(rel.incoming),
      requestsISent: people(rel.outgoing),
      scouting: people(rel.scouting),
      blocked: people(rel.blocked),
      muted: people(rel.muted),
      restricted: people(rel.restricted),
      listsCutShort: rel.truncated,
    },
    fence: {
      onMyFence,
      cardsINailedElsewhere: fence.myCardsElsewhere
        .filter((c) => visible(c.fenceOwnerId))
        .map((c) => ({
          onTheFenceOf: who(c.fenceOwnerId),
          words: c.body,
          state: stateLabel(c.state),
          nailedAt: iso(c.createdAt),
          photo: cardPhoto(c.photoId),
        })),
      repliesIWroteElsewhere: fence.myRepliesElsewhere
        .filter((r) => visible(r.fenceOwnerId) && visible(r.cardAuthorId))
        .map((r) => ({
          onTheFenceOf: who(r.fenceOwnerId),
          onACardBy: who(r.cardAuthorId),
          words: r.body,
          state: stateLabel(r.state),
          at: iso(r.createdAt),
        })),
      myReactions: fence.myReactions
        .filter((r) => visible(r.fenceOwnerId) && visible(r.cardAuthorId))
        .map((r) => ({
          reaction: r.kind,
          onTheFenceOf: who(r.fenceOwnerId),
          onACardBy: who(r.cardAuthorId),
          at: iso(r.createdAt),
        })),
    },
    whispers: {
      note: 'Whispers fade after 7 days, so only the last week is here.',
      threads: whispers.threads.map((t) => ({
        with: who(t.otherId),
        whispers: t.whispers.map((w) => ({
          from: w.fromMe ? 'me' : 'them',
          words: w.body,
          at: iso(w.sentAt),
        })),
      })),
      heldBackFromMe: whispers.held.map((h) => ({ from: who(h.fromId), words: h.body, at: iso(h.sentAt) })),
    },
    tributes: {
      onMyPorch: tributes.onMyPorch
        .filter((t) => visible(t.otherId))
        .map((t) => ({
          from: who(t.otherId),
          words: t.body,
          state: stateLabel(t.state),
          pinned: t.pinned,
          at: iso(t.createdAt),
        })),
      iWrote: tributes.byMe
        .filter((t) => visible(t.otherId))
        .map((t) => ({
          for: who(t.otherId),
          words: t.body,
          state: stateLabel(t.state),
          at: iso(t.createdAt),
        })),
    },
    marks: {
      receivedCounts: marks.received,
      iGave: marks.given
        .filter((m) => visible(m.targetId))
        .map((m) => ({ to: who(m.targetId), mark: m.kind, at: iso(m.givenAt) })),
    },
    timeCapsules: {
      opened: capsules.opened.map((c) => ({
        from: c.from ? { callSign: c.from.handle, name: c.from.displayName } : 'my past self',
        words: c.body,
        sealedAt: c.sealedAt,
        openedAt: c.openedAt,
      })),
      comingToMe: capsules.coming.map((c) => ({
        from: c.from ? { callSign: c.from.handle, name: c.from.displayName } : 'my past self',
        opensOn: c.openOn,
      })),
      iSealed: capsules.sealed.map((c) => ({
        to: c.to ? { callSign: c.to.handle, name: c.to.displayName } : 'my future self',
        opensOn: c.openOn,
        sealedAt: c.sealedAt,
        note: 'Sealed words stay sealed until the day, even from you.',
      })),
    },
    tracks: tracks.frozen
      ? { shadowWalk: true, note: 'Shadow Walk is on, so your Tracks are frozen.' }
      : {
          palsWhoStoppedBy: tracks.people.map((p) => ({
            callSign: p.handle,
            name: p.displayName,
            when: p.when,
          })),
          othersWhoStoppedBy: tracks.hidden,
        },
    townHalls: halls.map((h) => ({
      name: h.name,
      description: h.description,
      visibility: h.visibility,
      role: h.role,
      joinedAt: iso(h.joinedAt),
      myPosts: h.posts.map((p) => ({ words: p.body, at: iso(p.postedAt) })),
      myReplies: h.replies.map((r) => ({ words: r.body, at: iso(r.postedAt) })),
      myReactions: h.reactions.map((r) => ({ reaction: r.kind, at: iso(r.givenAt) })),
    })),
    moderation: {
      suspensionsOfMyAccount: moderation.suspensions.map((s) => ({
        reason: s.reason,
        from: iso(s.from),
        until: s.until ? iso(s.until) : null,
        endedAt: s.endedAt ? iso(s.endedAt) : null,
        appeal: s.appeal
          ? { words: s.appeal.text, sentAt: iso(s.appeal.sentAt), answer: s.appeal.answer }
          : null,
      })),
      reportsIFiled: moderation.reportsFiled.map((r) => ({
        about: r.about,
        reason: r.reason,
        details: r.details,
        at: iso(r.sentAt),
      })),
    },
  };

  const json = new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`);
  const readme = new TextEncoder().encode(readmeText(account.callSign, iso(now)));
  entries.push(
    { name: 'README.txt', read: async () => readme },
    { name: 'data.json', read: async () => json },
    ...photoEntries,
  );
  return { data, entries };
}

function readmeText(callSign: string, at: string): string {
  return `Howdy — your data (@${callSign}), exported ${at}

data.json    Everything in one file: your account and settings, Pals, Post Cards, Whispers,
             Tributes, Marks, Time Capsules, Tracks, Town Halls and moderation history.
photos/      Your Portrait and the photos on the Post Cards in data.json.

What is in it: everything you gave Howdy, plus what Howdy already shows you (cards on your
Fence, Whispers in your threads, Tributes on your Porch). Other people appear by call sign
and name only, and only if Howdy would show them to you today.

What is not: anyone else's email or private choices, who gave which Mark (Howdy never says),
the words of sealed Time Capsules (sealed until their day), and things that have already
faded (Whispers after 7 days, Tracks after 7 days, Signals after 12 hours).

Questions, or want a correction? Write to the address in the Privacy Policy.
`;
}
