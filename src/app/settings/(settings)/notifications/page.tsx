import { requireUser } from '@/modules/auth';
import { getPrefs } from '@/modules/notifications';
import { ChimePrefsForm } from '../ranch-forms';

export const metadata = { title: 'Notification settings' };

/** Settings › Notifications: which kinds ring. Each switch saves as it changes. */
export default async function NotificationSettingsPage() {
  const user = await requireUser();
  return <ChimePrefsForm initial={await getPrefs(user.id)} />;
}
