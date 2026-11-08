import { notFound } from 'next/navigation';
import { attachPortraits } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { getThread } from '@/modules/whispers';
import { getEnv } from '@/platform/config/env';
import { liveChannelFor } from '@/platform/live-ping';
import { AppError } from '@/platform/errors';
import { ClayCard, EmptyState } from '@/ui/primitives';
import { ThreadView } from './thread-view';
import { ClockIcon } from '@/ui/icons';

export const metadata = { title: 'Message', robots: { index: false, follow: false } };

/** One private thread. A thread I may not open is a plain 404 — the same for a stranger, a block and a made-up call sign. */
export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  /** `draft`: words to start the reply with — e.g. replying to their Story (ADR-047). Only ever pre-fills MY box. */
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const user = await requireUser();
  const { handle } = await params;
  const rawDraft = (await searchParams).draft;
  const draft = typeof rawDraft === 'string' ? rawDraft.slice(0, 200) : undefined;
  let page;
  try {
    page = await getThread(user.id, handle, {});
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') {
      return (
        <ClayCard className="flex flex-1 items-center justify-center">
          <EmptyState
            as="h1"
            icon={<ClockIcon className="text-text-primary" />}
            title="Slow down a little"
            description="Give it a minute and try again."
          />
        </ClayCard>
      );
    }
    throw err;
  }
  if (!page) notFound();
  await attachPortraits(user.id, [page.person]);
  return (
    // The chat pane of the Messages frame (which carries the page's <main>): a card the height of the screen; only the
    // messages scroll inside it.
    <section
      aria-label={`Conversation with ${page.person.displayName}`}
      className="clay flex min-h-0 flex-1 flex-col max-md:rounded-none max-md:border-0 max-md:shadow-none"
    >
      <ThreadView
        handle={page.person.handle}
        displayName={page.person.displayName}
        portraitTint={page.person.portraitTint}
        portraitUrl={page.person.portraitUrl}
        initial={{ messages: page.messages, hasMore: page.hasMore, seenUpTo: page.seenUpTo }}
        wsUrl={getEnv().WS_PUBLIC_URL}
        liveChannel={liveChannelFor(user.id)}
        {...(draft ? { initialDraft: draft } : {})}
      />
    </section>
  );
}
