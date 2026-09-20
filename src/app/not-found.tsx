import Link from 'next/link';
import { buttonClasses, ClayCard, EmptyState } from '@/ui/primitives';

export const metadata = { title: 'Not found' };

/**
 * Shown for any missing route AND for a Ranch the viewer may not see (those are deliberately identical). It has a
 * <main id="main"> so the skip link and landmark navigation work here too.
 */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <ClayCard>
        <EmptyState
          as="h1"
          icon="🌵"
          title="Nothing out here"
          description="We could not find that page."
          action={
            <Link href="/" className={buttonClasses()}>
              Back to the Gate
            </Link>
          }
        />
      </ClayCard>
    </main>
  );
}
