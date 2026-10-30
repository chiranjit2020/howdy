import { attachPortraits, withCards } from '@/app/_lib/social';
import { FenceSection } from '@/app/profile/[handle]/fence-section';
import { requireUser } from '@/modules/auth';
import { listFriendsFeed } from '@/modules/fence';
import { getPortraitVersion } from '@/modules/media';
import { litPals, myLight } from '@/modules/lights';
import { memoriesToday } from '@/modules/memories';
import { getOwnRanch, getTeamAnnouncement } from '@/modules/profiles';
import { listMyRelationships } from '@/modules/relationships';
import { storyRing } from '@/modules/stories';
import { listThreads } from '@/modules/whispers';
import { clockOf } from '@/shared/calendar';
import { portraitUrl } from '@/shared/portrait';
import { getEnv } from '@/platform/config/env';
import { liveChannelFor } from '@/platform/live-ping';
import { ChatDockProvider } from './chat-dock';
import { HomeRail, WhatsNew } from './home-rail';
import { MemoriesCard } from './memories-card';
import { StoriesStrip } from './stories-strip';

export const metadata = { title: 'Home' };

/**
 * First protected page: Stories, "What's on your mind?" and your friends' posts; on wide screens a right panel with
 * your circle right now (friends free to talk, latest messages, friend requests, On this day, the team's note). The
 * counts are beside the menu and the bell, and Free to talk is in the top bar, on every page. The session check happens
 * on the server: an unauthenticated request never reaches the markup.
 */
export default async function HomePage() {
  const user = await requireUser();
  // Independent lookups, asked for together rather than one after another. Everything but your own profile is
  // best-effort: Home never fails because one part could not be read.
  const [ranch, photo, lists, news, memories, ring, feed, lit, mine, threads] = await Promise.all([
    getOwnRanch(user.id),
    getPortraitVersion(user.id, { userId: user.id }).catch(() => null),
    // For the announcement below: whether this person has muted the Howdy team.
    listMyRelationships(user.id).then((r) => withCards(r, user.id)),
    getTeamAnnouncement().catch(() => null),
    memoriesToday(user.id).catch(() => null),
    // Stories (ADR-047).
    storyRing(user.id).catch(() => []),
    listFriendsFeed(user.id, { rateKey: user.id }).catch(() => null),
    // The right panel: friends who switched Free to talk on, and the latest conversations.
    litPals(user.id).catch(() => []),
    myLight(user.id).catch(() => null),
    listThreads(user.id)
      .then((t) => t.slice(0, 5))
      .catch(() => null),
  ]);
  // One look-up for every photo on the page, whoever it belongs to.
  await attachPortraits(user.id, [
    ...ring.map((r) => r.person),
    ...(memories?.pals.map((p) => p.pal) ?? []),
    ...(feed?.cards.flatMap((c) => [c.author, c.wall, ...c.replies.map((r) => r.author)]) ?? []),
    ...lit.map((l) => l.pal),
    ...(threads ?? []),
  ]);
  // The Howdy team's current Signal ("what's new"), unless this person has turned the team's noise down.
  const announcement = news && !lists.muted.some((m) => m.handle === news.author.handle) ? news : null;

  // "On this day" only when there is something to show (an empty wrapper would still take a gap in the column).
  const today =
    memories && memories.cards.length + memories.pals.length + memories.tributes.length > 0 ? memories : null;
  const free = lit.map((l) => ({ ...l.pal, note: l.note, untilLabel: clockOf(l.until) }));

  return (
    // The chat window (wide screens) opens from the right panel's Message buttons; it needs the same live settings as
    // the Messages page.
    <ChatDockProvider wsUrl={getEnv().WS_PUBLIC_URL} liveChannel={liveChannelFor(user.id)}>
      {/* The feed at a comfortable reading width (672 px), centred in the space beside the menu; from xl (1280 px) up
          the right panel beside it. No side padding of its own: the shell's 16 px is the gutter. */}
      <div className="flex w-full py-4 xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-6">
        <main id="main" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
          {/* The page's name for screen readers and the outline; on screen the sidebar already says where you are. */}
          <h1 className="sr-only">Home</h1>
          <StoriesStrip
            initial={ring}
            me={{
              handle: user.handle,
              displayName: ranch.displayName,
              portraitTint: ranch.portraitTint,
              ...(photo ? { portraitUrl: portraitUrl(user.handle, photo) } : {}),
            }}
          />
          {/* Below xl there is no right panel: the team's note and On this day come before the feed instead. */}
          {announcement && (
            <div className="xl:hidden">
              <WhatsNew news={announcement} id="whats-new" />
            </div>
          )}
          {today && (
            <div className="xl:hidden">
              <MemoriesCard memories={today} handle={user.handle} />
            </div>
          )}
          {feed ? (
            <FenceSection
              feed
              myHandle={user.handle}
              signedIn
              initial={{
                ...feed,
                // "What's on your mind?" posts to your own wall: its owner may always post there, with a photo, and
                // nothing waits for approval. The feed itself is not one wall, so nobody is its owner.
                isOwner: false,
                canPost: true,
                canAddPhoto: true,
                review: false,
              }}
            />
          ) : (
            <p className="text-caption text-text-secondary">Friends’ posts could not be loaded just now.</p>
          )}
        </main>

        {/* top-18 clears the sticky top bar (3.5rem) plus the page's own 16 px top padding. */}
        <aside
          aria-label="Your circle"
          className="sticky top-18 hidden max-h-[calc(100dvh-5.5rem)] flex-col gap-4 overflow-y-auto xl:flex [&>*]:shrink-0"
        >
          <HomeRail
            free={free}
            threads={threads}
            requests={lists.incoming}
            friends={[...lists.posse].sort((a, b) => b.at.localeCompare(a.at))}
            myLight={mine ? { untilLabel: clockOf(mine.until) } : null}
            memories={today}
            news={announcement}
            handle={user.handle}
          />
        </aside>
      </div>
    </ChatDockProvider>
  );
}
