import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { EntryCard, EntryHeading } from '@/ui/auth/entry-shell';
import { buttonClasses } from '@/ui/primitives';

export const metadata = { title: 'Welcome' };

/** The front door. Signed-in visitors go straight to their home. */
export default async function GatePage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <EntryCard>
      <EntryHeading title="Welcome to Howdy">
        A small-circle social world. Posts, quiet visits and private messages — no endless feed.
      </EntryHeading>
      <div className="flex flex-col gap-3">
        <Link href="/signup" className={buttonClasses({ fullWidth: true })}>
          Create account
        </Link>
        <Link href="/login" className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
          Log in
        </Link>
      </div>
    </EntryCard>
  );
}
