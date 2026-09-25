import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { Glyph } from '@/ui/art/glyph';
import { cn } from '@/ui/cn';
import { buttonClasses, ClayCard } from '@/ui/primitives';

export const metadata = { title: 'The Gate' };

/** The Gate: the front door. Signed-in visitors go straight to their home. */
export default async function GatePage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-md flex-col px-4 py-6 sm:min-h-[70dvh] sm:justify-center sm:py-8"
    >
      <ClayCard className="flex flex-col items-center gap-4 p-6 text-center sm:p-7">
        <Glyph emoji="🤠" size="hero" />
        <h1 className="text-heading text-text-primary">Howdy, partner.</h1>
        <p className="text-body text-text-secondary">
          A small-circle social world. Post cards, quiet visits and private whispers — no endless feed.
        </p>
        {/* The Howdy name leads; the line underneath says plainly what each one does. */}
        <div className="mt-1 flex w-full flex-col gap-3">
          <Link
            href="/stake-a-claim"
            className={cn(buttonClasses({ size: 'lg', fullWidth: true }), 'flex-col gap-0.5 py-2.5')}
          >
            <span className="leading-tight">Stake a Claim</span>
            <span className="text-caption leading-tight font-medium">Create your account</span>
          </Link>
          <Link
            href="/step-inside"
            className={cn(
              buttonClasses({ variant: 'secondary', size: 'lg', fullWidth: true }),
              'flex-col gap-0.5 py-2.5',
            )}
          >
            <span className="leading-tight">Step Inside</span>
            <span className="text-caption leading-tight font-medium text-text-secondary">
              Sign in to continue
            </span>
          </Link>
        </div>
      </ClayCard>
    </main>
  );
}
