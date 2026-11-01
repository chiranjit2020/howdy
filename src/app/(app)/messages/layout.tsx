import { Suspense, type ReactNode } from 'react';
import { attachPortraits, withCards } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { listMyRelationships } from '@/modules/relationships';
import { countHeld, listThreads } from '@/modules/whispers';
import { liveChannelFor } from '@/platform/live-ping';
import { LiveRefresh } from '@/ui/live/live-refresh';
import { ConversationList, ConversationListSkeleton } from './conversation-list';
import { MessagesFrame } from './messages-frame';

/**
 * Messages as a messenger: the conversation list and the open chat side by side on wide screens, one at a time on a
 * phone (the chat full screen). The list lives here, so it stays put while you move between chats; it streams in behind
 * its outline, so opening Messages is instant. Protected: every piece checks the session on the server.
 */
export default function MessagesLayout({ children }: { children: ReactNode }) {
  return (
    <MessagesFrame
      list={
        <Suspense fallback={<ConversationListSkeleton />}>
          <Conversations />
        </Suspense>
      }
    >
      {children}
    </MessagesFrame>
  );
}

async function Conversations() {
  const user = await requireUser();
  const [threads, held, friends] = await Promise.all([
    listThreads(user.id),
    // Best-effort: the tray link and the New message list are conveniences, never a reason for the list to fail.
    countHeld(user.id).catch(() => 0),
    listMyRelationships(user.id)
      .then((r) => withCards(r, user.id))
      .then((l) => l.posse)
      .catch(() => []),
  ]);
  await attachPortraits(user.id, threads);
  return (
    <>
      <ConversationList threads={threads} held={held} friends={friends} />
      {/* A new message anywhere refreshes the list (and the open chat catches up on its own). */}
      <LiveRefresh channel={liveChannelFor(user.id)} />
    </>
  );
}
