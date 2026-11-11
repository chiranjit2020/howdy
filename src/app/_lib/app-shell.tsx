import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { adminStanding } from '@/modules/admin';
import { getCurrentUser, pendingAcceptances } from '@/modules/auth';
import { litPals, myLight } from '@/modules/lights';
import { getPortraitVersion } from '@/modules/media';
import { pushPublicKey } from '@/modules/push';
import { isModerator } from '@/modules/moderation';
import { unreadCount } from '@/modules/notifications';
import { getCards, getOwnRanch } from '@/modules/profiles';
import { incomingRequesterIds } from '@/modules/relationships';
import { countMyInvites } from '@/modules/town-halls';
import { newVisits } from '@/modules/tracks';
import { unreadThreads } from '@/modules/whispers';
import { clockOf } from '@/shared/calendar';
import { portraitUrl } from '@/shared/portrait';
import { attachPortraits } from './social';
import { liveChannelFor } from '@/platform/live-ping';
import { LiveRefresh } from '@/ui/live/live-refresh';
import { LiveProvider } from '@/ui/live/use-live-ring';
import { PwaBoot } from '@/ui/pwa/pwa-boot';
import { AppShell, NO_COUNTS, type ShellCounts } from '@/ui/shell/app-shell';
import { Streamed } from '@/ui/shell/streamed';

/**
 * The counts beside the menu, the bell's number and Free to talk. Never rejects: a count that cannot be read is zero, so
 * a hiccup never takes the page down (the frame already went out without them).
 */
async function shellCounts(userId: string, moderator: boolean): Promise<ShellCounts> {
  const [unread, unreadWhispers, townHallInvites, friendRequests, visits, lit, mine, standing] =
    await Promise.all([
      unreadCount(userId).catch(() => 0),
      unreadThreads(userId).catch(() => 0),
      countMyInvites(userId).catch(() => 0),
      // Friend requests waiting for me, from people who are still active (what the Friends page lists).
      incomingRequesterIds(userId)
        .then(async (ids) => (await getCards(ids)).size)
        .catch(() => 0),
      newVisits(userId).catch(() => 0),
      // Free to talk (Porch Lights, ADR-032): the friends whose light is on for me, and my own.
      litPals(userId).catch(() => []),
      myLight(userId).catch(() => null),
      // Only staff can be admins, so everyone else skips the lookup.
      moderator
        ? adminStanding(userId).catch(() => 'not_admin' as const)
        : Promise.resolve('not_admin' as const),
    ]);
  await attachPortraits(
    userId,
    lit.map((l) => l.pal),
  ).catch(() => undefined);
  return {
    unread,
    unreadWhispers,
    townHallInvites,
    friendRequests,
    newVisits: visits,
    freeToTalk: {
      lit: lit.map((l) => ({ ...l.pal, note: l.note, untilLabel: clockOf(l.until) })),
      mine: mine ? { audience: mine.audience, note: mine.note, untilLabel: clockOf(mine.until) } : null,
    },
    admin: standing !== 'not_admin',
  };
}

/**
 * Works out who is looking and what the shell needs to show for them: their name and avatar tint, and the counts beside
 * the menu (unread notifications and messages, friend requests, today's profile visits, group invites), and Free to talk
 * (my light, and the friends who are free now). Everything beyond "who" is best-effort: a problem counting or reading
 * must never take a page down (the counts fall back to zero and the name to the handle).
 */
export async function AppFrame({
  children,
  waysIn = true,
  bare = false,
  askToAgree = true,
}: {
  children: ReactNode;
  /** Signed out: show the Step Inside / Stake a Claim buttons in the top bar. The sign-in pages turn them off. */
  waysIn?: boolean;
  /** Signed out: no top bar and no site footer. Log in and Create account carry their own logo and links. */
  bare?: boolean;
  /**
   * Send a signed-in person who has not agreed to the current Terms / Privacy Policy to `/agree` first. Off for the
   * legal pages themselves (they must be readable before agreeing) and for `/agree`.
   */
  askToAgree?: boolean;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <PwaBoot signedIn={false} />
        <AppShell waysIn={waysIn} bare={bare}>
          {children}
        </AppShell>
      </>
    );
  }
  // Only what shapes the frame is waited for: your name and picture, the Terms check (it may send you elsewhere) and
  // whether the Moderation link is there. The counts (below) are started now but NOT waited for: the frame and the page
  // go out at once and the badges stream in (2026-11-12; waiting for all of them cost live Home ~2 s before its first byte).
  const [ranch, photo, pending, moderator] = await Promise.all([
    getOwnRanch(user.id).catch(() => null),
    getPortraitVersion(user.id, { userId: user.id }).catch(() => null),
    // Best-effort like the rest: if the check itself fails, let the person in rather than take every page down.
    askToAgree ? pendingAcceptances(user.id).catch(() => []) : Promise.resolve([]),
    isModerator(user.id).catch(() => false),
  ]);
  if (pending.length > 0) redirect('/agree');
  const counts = shellCounts(user.id, moderator).catch(() => NO_COUNTS);
  return (
    <LiveProvider channel={liveChannelFor(user.id)}>
      {/* New notification or message: the counts beside the menu (and whatever the page draws) catch up by themselves. */}
      <LiveRefresh />
      {/* Waits for the unread count (it sets the app icon's number), so it starts once the counts are in. */}
      <Streamed
        value={counts}
        render={(c) => <PwaBoot signedIn unread={c.unread} vapidKey={pushPublicKey()} />}
      />
      <AppShell
        me={{
          handle: user.handle,
          displayName: ranch?.displayName ?? user.handle,
          portraitTint: ranch?.portraitTint,
          portraitUrl: photo ? portraitUrl(user.handle, photo) : null,
        }}
        moderator={moderator}
        live={counts}
      >
        {children}
      </AppShell>
    </LiveProvider>
  );
}
