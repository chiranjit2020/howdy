import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { AuthCard } from '@/ui/auth/auth-card';
import { TrailArt } from '@/ui/auth/illustrations';
import { buttonClasses } from '@/ui/primitives';

export const metadata = { title: 'The Gate' };

/** The Gate: the front door. Signed-in visitors go straight to their home. */
export default async function GatePage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <AuthCard scene="trail" art={<TrailArt />} logo="lg" className="gap-4 pb-32">
      <h1 className="font-display text-headline text-brand-ink">Howdy, partner.</h1>
      <p className="text-body text-auth-text">
        A small-circle social world. Post cards, quiet visits and private whispers — no endless feed.
      </p>
      <div className="mt-2 flex w-full flex-col gap-3">
        <Link
          href="/stake-a-claim"
          className={buttonClasses({ variant: 'cta', size: 'lg', fullWidth: true })}
        >
          Stake a Claim
        </Link>
        <Link
          href="/step-inside"
          className={buttonClasses({ variant: 'secondary', size: 'lg', fullWidth: true })}
        >
          Step Inside
        </Link>
      </div>
    </AuthCard>
  );
}
