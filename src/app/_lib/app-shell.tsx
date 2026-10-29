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
import { visitsToday } from '@/modules/tracks';
import { unreadThreads } from '@/modules/whispers';
import { clockOf } from '@/shared/calendar';
import { portraitUrl } from '@/shared/portrait';
import { attachPortraits } from './social';
import { PwaBoot } from '@/ui/pwa/pwa-boot';
import { AppShell } from '@/ui/shell/app-shell';

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
  const [unread, unreadWhispers, invites, requests, visits, ranch, photo, pending, moderator, lit, mine] =
    await Promise.all([
      unreadCount(user.id).catch(() => 0),
      unreadThreads(user.id).catch(() => 0),
      countMyInvites(user.id).catch(() => 0),
      // Friend requests waiting for me, from people who are still active (what the Friends page lists).
      incomingRequesterIds(user.id)
        .then(async (ids) => (await getCards(ids)).size)
        .catch(() => 0),
      visitsToday(user.id).catch(() => 0),
      getOwnRanch(user.id).catch(() => null),
      getPortraitVersion(user.id, { userId: user.id }).catch(() => null),
      // Best-effort like the rest: if the check itself fails, let the person in rather than take every page down.
      askToAgree ? pendingAcceptances(user.id).catch(() => []) : Promise.resolve([]),
      isModerator(user.id).catch(() => false),
      // Free to talk (Porch Lights, ADR-032): the friends whose light is on for me, and my own.
      litPals(user.id).catch(() => []),
      myLight(user.id).catch(() => null),
    ]);
  if (pending.length > 0) redirect('/agree');
  await attachPortraits(
    user.id,
    lit.map((l) => l.pal),
  );
  const freeToTalk = {
    lit: lit.map((l) => ({ ...l.pal, note: l.note, untilLabel: clockOf(l.until) })),
    mine: mine ? { audience: mine.audience, note: mine.note, untilLabel: clockOf(mine.until) } : null,
  };
  // Only staff can be admins, so everyone else skips the extra lookup.
  const admin = moderator && (await adminStanding(user.id).catch(() => 'not_admin' as const)) !== 'not_admin';
  return (
    <>
      <PwaBoot signedIn unread={unread} vapidKey={pushPublicKey()} />
      <AppShell
        me={{
          handle: user.handle,
          displayName: ranch?.displayName ?? user.handle,
          portraitTint: ranch?.portraitTint,
          portraitUrl: photo ? portraitUrl(user.handle, photo) : null,
        }}
        unread={unread}
        unreadWhispers={unreadWhispers}
        friendRequests={requests}
        visitsToday={visits}
        townHallInvites={invites}
        freeToTalk={freeToTalk}
        moderator={moderator}
        admin={admin}
      >
        {children}
      </AppShell>
    </>
  );
}
