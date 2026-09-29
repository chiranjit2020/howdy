import Link from 'next/link';
import { withCards } from '@/app/_lib/social';
import { Glyph } from '@/ui/art/glyph';
import { listMySessions, requireUser } from '@/modules/auth';
import { memoriesToday } from '@/modules/memories';
import { getOwnRanch, getTeamAnnouncement } from '@/modules/profiles';
import { listMyRelationships } from '@/modules/relationships';
import { cn } from '@/ui/cn';
import { VerifiedBadge } from '@/ui/howdy';
import { Badge, buttonClasses, ClayCard } from '@/ui/primitives';
import { HitTheTrail, HitTheTrailEverywhere, OpenGates } from './home-actions';
import { MemoriesCard } from './memories-card';

export const metadata = { title: 'Home' };

const SMALL = buttonClasses({ variant: 'secondary', size: 'sm', compact: true });

/** First protected page. The session check happens on the server: an unauthenticated request never reaches the markup. */
export default async function HomePage() {
  const user = await requireUser();
  // Independent lookups, asked for together rather than one after another.
  const [ranch, lists, sessions, news, memories] = await Promise.all([
    getOwnRanch(user.id),
    // Only requests from people who are still active count (a suspended account's request is not shown or counted).
    listMyRelationships(user.id).then(withCards),
    listMySessions(),
    // Best-effort: Home never fails because the announcement could not be read.
    getTeamAnnouncement().catch(() => null),
    // Best-effort as well: a memory is a nice extra, never a reason for Home to fail.
    memoriesToday(user.id).catch(() => null),
  ]);
  const requests = lists.incoming.length;
  // The Howdy team's current Signal ("what's new"), unless this person has turned the team's noise down.
  const announcement = news && !lists.muted.some((m) => m.handle === news.author.handle) ? news : null;
  const gates = sessions.map((s) => ({
    id: s.id,
    deviceLabel: s.deviceLabel,
    lastSeenAt: s.lastSeenAt.toISOString(),
    current: s.current,
  }));

  return (
    <>
      {/* No side padding of its own: the shell's px-4 is the gutter, so the cards use the full phone width. */}
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
        <ClayCard className="flex flex-col gap-3 p-4 sm:gap-4 sm:p-6">
          {/* The picture sits beside the greeting rather than above it, which saves a row on a phone. */}
          <div className="flex items-center gap-3">
            <Glyph emoji="📜" size="free" className="size-10 shrink-0 sm:size-14" />
            <div className="min-w-0">
              <h1 className="text-heading text-text-primary">Howdy, {ranch.displayName}</h1>
              <p className="flex flex-wrap items-center gap-x-2 text-caption text-text-secondary">
                <span>Deed granted, @{user.handle}.</span>
                {/* A quiet fact, not a headline: small muted text with a tick, no pill. */}
                <span className="inline-flex items-center gap-1 text-metadata text-text-muted">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-3 fill-none stroke-current stroke-[3]"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Email confirmed
                </span>
              </p>
            </div>
          </div>
          {/* One main action, then the everyday small ones in a single row of three. */}
          <Link href={`/porch/${user.handle}`} className={buttonClasses({ fullWidth: true })}>
            Visit your Porch
          </Link>
          {/* Each takes the width its label needs, so all three fit one row even on a 320 px phone (it may wrap only
              there, when a "new requests" count is showing). */}
          <div className="flex flex-wrap gap-2">
            <Link href="/pals" className={cn(SMALL, 'flex-auto')}>
              Pals{requests > 0 && <span className="sr-only">, </span>}
              {requests > 0 && (
                <Badge tone="accent">
                  {requests}
                  <span className="sr-only"> new</span>
                </Badge>
              )}
            </Link>
            <Link href="/workshop" className={cn(SMALL, 'flex-auto')}>
              Workshop
            </Link>
            <HitTheTrail className="flex-auto" />
          </div>
          <div className="-mt-2 -mb-2 flex justify-end">
            <HitTheTrailEverywhere />
          </div>
        </ClayCard>
        {announcement && (
          <section aria-labelledby="whats-new" className="clay flex flex-col gap-2 bg-info/25 p-4 sm:p-5">
            <h2
              id="whats-new"
              className="flex items-center gap-1.5 text-metadata font-semibold tracking-wider text-text-secondary uppercase"
            >
              What’s new on Howdy
            </h2>
            <p className="text-body break-words text-text-primary">{announcement.text}</p>
            <p className="text-caption text-text-secondary">
              <Link href={`/porch/${announcement.author.handle}`} className="font-semibold">
                {announcement.author.displayName}
              </Link>
              {announcement.author.verified && <VerifiedBadge className="ml-1" />}
            </p>
          </section>
        )}
        {memories && <MemoriesCard memories={memories} handle={user.handle} />}
        {/* Technical, and rarely needed: a quiet folded line instead of a card of its own. */}
        <OpenGates initial={gates} />
      </main>
    </>
  );
}
