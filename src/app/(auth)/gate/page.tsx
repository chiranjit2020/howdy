import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { Glyph } from '@/ui/art/glyph';
import { buttonClasses, ClayCard } from '@/ui/primitives';

export const metadata = { title: 'The Gate' };

/** The Gate: the front door. Signed-in visitors go straight to their home. */
export default async function GatePage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col justify-center px-4 py-8">
      <ClayCard className="flex flex-col items-center gap-4 p-8 text-center">
        <Glyph emoji="🤠" size="hero" />
        <h1 className="text-heading text-text-primary">Howdy, partner.</h1>
        <p className="text-body text-text-secondary">
          A small-circle social world. Post cards, quiet visits and private whispers — no endless feed.
        </p>
        <div className="mt-2 flex w-full flex-col gap-3">
          <Link href="/stake-a-claim" className={buttonClasses({ size: 'lg', fullWidth: true })}>
            Stake a Claim
          </Link>
          <Link
            href="/step-inside"
            className={buttonClasses({ variant: 'secondary', size: 'lg', fullWidth: true })}
          >
            Step Inside
          </Link>
        </div>
      </ClayCard>
    </main>
  );
}
