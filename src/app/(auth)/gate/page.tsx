import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { Glyph } from '@/ui/art/glyph';
import { cn } from '@/ui/cn';
import { buttonClasses, ClayCard } from '@/ui/primitives';

export const metadata = { title: 'Welcome' };

/** The Gate: the front door. Signed-in visitors go straight to their home. */
export default async function GatePage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <main
      id="main"
      // Centred in the space under the top bar (4rem + its 1px border), at every screen size.
      className="mx-auto flex min-h-[calc(100dvh-4rem-1px)] w-full max-w-md flex-col justify-center px-4 py-6"
    >
      <ClayCard className="flex flex-col items-center gap-4 p-6 text-center sm:p-7">
        <Glyph emoji="🤠" size="hero" />
        <h1 className="text-heading text-text-primary">Welcome to Howdy.</h1>
        <p className="text-body text-text-secondary">
          A small-circle social world. Posts, quiet visits and private messages — no endless feed.
        </p>
        {/* The Howdy name leads; the line underneath says plainly what each one does. */}
        <div className="mt-1 flex w-full flex-col gap-3">
          <Link
            href="/signup"
            className={cn(buttonClasses({ size: 'lg', fullWidth: true }), 'flex-col gap-1 py-3')}
          >
            <span className="leading-none">Sign up</span>
            <span className="text-caption leading-none font-medium">Create your account</span>
          </Link>
          <Link
            href="/login"
            className={cn(
              buttonClasses({ variant: 'secondary', size: 'lg', fullWidth: true }),
              'flex-col gap-1 py-3',
            )}
          >
            <span className="leading-none">Log in</span>
            <span className="text-caption leading-none font-medium text-text-secondary">
              Sign in to continue
            </span>
          </Link>
        </div>
      </ClayCard>
    </main>
  );
}
