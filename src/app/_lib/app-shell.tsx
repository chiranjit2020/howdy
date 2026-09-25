import type { ReactNode } from 'react';
import { getCurrentUser } from '@/modules/auth';
import { getPortraitVersion } from '@/modules/media';
import { unreadCount } from '@/modules/notifications';
import { getOwnRanch } from '@/modules/profiles';
import { countMyInvites } from '@/modules/town-halls';
import { unreadThreads } from '@/modules/whispers';
import { portraitUrl } from '@/shared/portrait';
import { AppShell } from '@/ui/shell/app-shell';

/**
 * Works out who is looking and what the shell needs to show for them: their name and avatar tint, and how many unread Chimes
 * and Whisper threads they can see. Everything beyond "who" is best-effort: a problem counting or reading must never take a
 * page down (the counts fall back to zero and the name to the handle).
 */
export async function AppFrame({
  children,
  waysIn = true,
}: {
  children: ReactNode;
  /** Signed out: show the Step Inside / Stake a Claim buttons in the top bar. The sign-in pages turn them off. */
  waysIn?: boolean;
}) {
  const user = await getCurrentUser();
  if (!user) return <AppShell waysIn={waysIn}>{children}</AppShell>;
  const [unread, unreadWhispers, invites, ranch, photo] = await Promise.all([
    unreadCount(user.id).catch(() => 0),
    unreadThreads(user.id).catch(() => 0),
    countMyInvites(user.id).catch(() => 0),
    getOwnRanch(user.id).catch(() => null),
    getPortraitVersion(user.id).catch(() => null),
  ]);
  return (
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
    >
      {children}
    </AppShell>
  );
}
