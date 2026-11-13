import { attachPortraits } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { listChimes, unreadCount } from '@/modules/notifications';
import { announcementPending, BUY_OR_WAIT_ANNOUNCEMENT, isTeamMember, pushPublicKey } from '@/modules/push';
import { PageFrame } from '@/ui/howdy/page-frame';
import { AppOnPhone } from '@/ui/pwa/app-on-phone';
import { AnnouncementPreview } from './announcement-preview';
import { ChimeList } from './chime-list';

export const metadata = { title: 'Notifications' };

/**
 * Notifications, in Home's frame (its column sits where Home's does). Protected: the session is checked on the server
 * before any of this renders.
 */
export default async function ChimesPage() {
  const user = await requireUser();
  const seenAt = new Date().toISOString(); // what this page shows; anything newer stays unread
  const [page, bell, team] = await Promise.all([
    listChimes(user.id, {}),
    unreadCount(user.id),
    isTeamMember(user.id).catch(() => false),
  ]);
  // The team's own preview of a scheduled announcement, until it has gone out.
  const announcing = team && announcementPending(BUY_OR_WAIT_ANNOUNCEMENT);
  await attachPortraits(
    user.id,
    page.chimes.map((c) => c.actor),
  );
  return (
    <PageFrame>
      <ChimeList
        initial={{
          chimes: page.chimes.map((c) => ({ ...c, at: c.at.toISOString() })),
          nextCursor: page.nextCursor,
          unread: page.unread,
        }}
        seenAt={seenAt}
        bell={bell}
      />
      <AppOnPhone vapidKey={pushPublicKey()} />
      {announcing && (
        <AnnouncementPreview
          body={BUY_OR_WAIT_ANNOUNCEMENT.payload.body}
          when="Saturday 15 November, 7:30 to 8:30 pm IST"
        />
      )}
    </PageFrame>
  );
}
