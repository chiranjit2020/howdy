import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUser, pendingAcceptances } from '@/modules/auth';
import { getPortraitVersion } from '@/modules/media';
import { pushPublicKey } from '@/modules/push';
import { isModerator } from '@/modules/moderation';
import { unreadCount } from '@/modules/notifications';
import { getOwnRanch } from '@/modules/profiles';
import { countMyInvites } from '@/modules/town-halls';
import { unreadThreads } from '@/modules/whispers';
import { portraitUrl } from '@/shared/portrait';
import { PwaBoot } from '@/ui/pwa/pwa-boot';
import { AppShell } from '@/ui/shell/app-shell';

/**
 * Works out who is looking and what the shell needs to show for them: their name and avatar tint, and how many unread Chimes
 * and Whisper threads they can see. Everything beyond "who" is best-effort: a problem counting or reading must never take a
 * page down (the counts fall back to zero and the name to the handle).
 */
export async function AppFrame({
  children,
  waysIn = true,
  askToAgree = true,
}: {
  children: ReactNode;
  /** Signed out: show the Step Inside / Stake a Claim buttons in the top bar. The sign-in pages turn them off. */
  waysIn?: boolean;
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
        <AppShell waysIn={waysIn}>{children}</AppShell>
      </>
    );
  }
  const [unread, unreadWhispers, invites, ranch, photo, pending, moderator] = await Promise.all([
    unreadCount(user.id).catch(() => 0),
    unreadThreads(user.id).catch(() => 0),
    countMyInvites(user.id).catch(() => 0),
    getOwnRanch(user.id).catch(() => null),
    getPortraitVersion(user.id, { userId: user.id }).catch(() => null),
    // Best-effort like the rest: if the check itself fails, let the person in rather than take every page down.
    askToAgree ? pendingAcceptances(user.id).catch(() => []) : Promise.resolve([]),
    isModerator(user.id).catch(() => false),
  ]);
  if (pending.length > 0) redirect('/agree');
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
        townHallInvites={invites}
        moderator={moderator}
      >
        {children}
      </AppShell>
    </>
  );
}
