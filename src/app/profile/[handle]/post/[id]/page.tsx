import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import type { Actor } from '@/modules/authz';
import { getFenceCard } from '@/modules/fence';
import { getRanchForViewer } from '@/modules/profiles';
import { attachPortraits } from '@/app/_lib/social';
import { AppError } from '@/platform/errors';
import { PageFrame } from '@/ui/howdy/page-frame';
import { buttonClasses, ClayCard, EmptyState } from '@/ui/primitives';
import { cn } from '@/ui/cn';
import { BackIcon, ClockIcon } from '@/ui/icons';
import { FenceSection } from '../../fence-section';

// Like the wall it is on: private, never in a search index.
export const metadata = { title: 'Post', robots: { index: false, follow: false } };

/**
 * One post on its own page, with every reply shown (2026-11-08). Notifications about a post (a Star, a reply, a new post
 * on your wall) lead here, so you see which post they mean instead of the top of a wall. Exactly the wall's rules
 * (getFenceCard): a post the viewer may not see, or one taken down, is simply not found.
 */
export default async function PostPage({ params }: { params: Promise<{ handle: string; id: string }> }) {
  const { handle, id } = await params;
  const user = await getCurrentUser();
  // Signed out there is nothing to show (walls need an account); the profile page has the "Log in" prompt.
  if (!user) notFound();
  const viewer: Actor = { kind: 'user', id: user.id, status: 'active' };
  const rateKey = user.id;

  let page: Awaited<ReturnType<typeof getFenceCard>>;
  let ranch: Awaited<ReturnType<typeof getRanchForViewer>>;
  try {
    [page, ranch] = await Promise.all([
      getFenceCard(viewer, handle, id, { rateKey }),
      getRanchForViewer(viewer, handle, { rateKey }),
    ]);
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') {
      return (
        <PageFrame>
          <ClayCard>
            <EmptyState
              as="h1"
              icon={<ClockIcon className="text-text-primary" />}
              title="Slow down a little"
              description="Give it a minute and try again."
            />
          </ClayCard>
        </PageFrame>
      );
    }
    throw err;
  }
  if (!page || !ranch) notFound();

  await attachPortraits(
    user.id,
    page.cards.flatMap((c) => [c.author, ...c.replies.map((reply) => reply.author)]),
  );

  return (
    <PageFrame>
      <h1 className="sr-only">Post on {ranch.displayName}’s wall</h1>
      <FenceSection handle={ranch.handle} ownerName={ranch.displayName} single initial={page} signedIn />
      <Link
        href={`/profile/${ranch.handle}`}
        className={cn(buttonClasses({ variant: 'secondary' }), 'self-center')}
      >
        <BackIcon className="size-4" aria-hidden="true" /> See all of {ranch.displayName}’s wall
      </Link>
    </PageFrame>
  );
}
