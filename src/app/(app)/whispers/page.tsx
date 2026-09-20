import Link from 'next/link';
import { AppHeader } from '@/app/_lib/app-header';
import { requireUser } from '@/modules/auth';
import { listThreads } from '@/modules/whispers';
import { formatRelative } from '@/ui/howdy';
import { Avatar, Badge, ClayCard, EmptyState } from '@/ui/primitives';

export const metadata = { title: 'Whispers' };

/** My Whisper threads. Protected: the session is checked on the server before any of this renders. */
export default async function WhispersPage() {
  const user = await requireUser();
  const threads = await listThreads(user.id);
  return (
    <>
      <AppHeader current="whispers" />
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8">
        <h1 className="text-heading text-text-primary">Whispers</h1>
        {threads.length === 0 ? (
          <ClayCard>
            <EmptyState
              icon="🤫"
              title="No Whispers yet"
              description="Open the Ranch of someone in your Posse and choose Whisper to start a private conversation."
            />
          </ClayCard>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Your Whisper threads">
            {threads.map((t) => (
              <li key={t.handle}>
                <Link
                  href={`/whispers/${t.handle}`}
                  className="flex min-h-11 items-center gap-3 rounded-lg bg-surface p-3 no-underline shadow-clay-sm"
                >
                  <Avatar name={t.displayName} tint={t.portraitTint} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold [overflow-wrap:anywhere] text-text-primary">
                      {t.displayName}
                    </span>
                    <span className="block truncate text-caption text-text-secondary">
                      {t.last.mine && <span className="sr-only">You said: </span>}
                      {t.last.mine ? 'You: ' : ''}
                      {t.last.body}
                    </span>
                    <span className="text-metadata text-text-secondary">
                      {formatRelative(new Date(t.last.at))}
                      {t.muted && ' · muted'}
                    </span>
                  </span>
                  {t.unread > 0 && (
                    <Badge tone="accent">
                      {t.unread > 99 ? '99+' : t.unread}
                      <span className="sr-only"> unread</span>
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
