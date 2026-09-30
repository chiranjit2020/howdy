import { notFound } from 'next/navigation';
import { attachPortraits } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { getThread } from '@/modules/whispers';
import { getEnv } from '@/platform/config/env';
import { AppError } from '@/platform/errors';
import { ClayCard, EmptyState } from '@/ui/primitives';
import { ThreadView } from './thread-view';

export const metadata = { title: 'Whisper', robots: { index: false, follow: false } };

/** One private thread. A thread I may not open is a plain 404 — the same for a stranger, a block and a made-up call sign. */
export default async function ThreadPage({ params }: { params: Promise<{ handle: string }> }) {
  const user = await requireUser();
  const { handle } = await params;
  let page;
  try {
    page = await getThread(user.id, handle, {});
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') {
      return (
        <>
          <main id="main" className="mx-auto max-w-md px-4 py-16">
            <ClayCard>
              <EmptyState
                as="h1"
                icon="⏳"
                title="Easy there, partner"
                description="Give it a minute and try again."
              />
            </ClayCard>
          </main>
        </>
      );
    }
    throw err;
  }
  if (!page) notFound();
  await attachPortraits(user.id, [page.person]);
  return (
    <>
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-4 py-4 sm:py-6">
        <ThreadView
          handle={page.person.handle}
          displayName={page.person.displayName}
          portraitTint={page.person.portraitTint}
          portraitUrl={page.person.portraitUrl}
          initial={{ messages: page.messages, hasMore: page.hasMore, seenUpTo: page.seenUpTo }}
          wsUrl={getEnv().WS_PUBLIC_URL}
        />
      </main>
    </>
  );
}
