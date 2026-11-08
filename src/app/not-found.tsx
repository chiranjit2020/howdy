import Link from 'next/link';
import { PiSignpost } from 'react-icons/pi';
import { StatusPage } from '@/ui/howdy/status-page';
import { buttonClasses } from '@/ui/primitives';

export const metadata = { title: 'Page not found' };

/**
 * Shown for any missing address AND for a profile, message thread or group the viewer may not see (those are deliberately
 * identical: it never says "this exists but is hidden"). "Go to Home" goes to `/`, which sends signed-in people Home and
 * everyone else to the welcome page.
 */
export default function NotFound() {
  return (
    <StatusPage
      Icon={PiSignpost}
      title="Page not found"
      actions={
        <Link href="/" className={buttonClasses()}>
          Go to Home
        </Link>
      }
    >
      <p>
        This page doesn’t exist, or it isn’t shared with you. Check the address, or start again from Home.
      </p>
    </StatusPage>
  );
}
