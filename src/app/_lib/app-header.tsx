import { getCurrentUser } from '@/modules/auth';
import { unreadCount } from '@/modules/notifications';
import { unreadThreads } from '@/modules/whispers';
import { SiteHeader } from '@/ui/site-header';

/**
 * The top bar for every page: works out who is looking and how many unread Chimes they can see. The count is best-effort — a
 * problem counting must never take a page down.
 */
export async function AppHeader({
  current,
}: {
  current?: 'home' | 'ranch' | 'posse' | 'whispers' | 'tracks' | 'chimes' | 'workshop';
}) {
  const user = await getCurrentUser();
  let unread = 0;
  let unreadWhispers = 0;
  if (user) {
    [unread, unreadWhispers] = await Promise.all([
      unreadCount(user.id).catch(() => 0),
      unreadThreads(user.id).catch(() => 0),
    ]);
  }
  return (
    <SiteHeader handle={user?.handle} current={current} unread={unread} unreadWhispers={unreadWhispers} />
  );
}
