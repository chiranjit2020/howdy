import Link from 'next/link';
import { attachPortraits, withCards } from '@/app/_lib/social';
import { FenceSection } from '@/app/profile/[handle]/fence-section';
import { requireUser } from '@/modules/auth';
import { listFriendsFeed } from '@/modules/fence';
import { litPals, myLight } from '@/modules/lights';
import { getPortraitVersion } from '@/modules/media';
import { memoriesToday } from '@/modules/memories';
import { getOwnRanch, getTeamAnnouncement } from '@/modules/profiles';
import { listMyRelationships } from '@/modules/relationships';
import { storyRing } from '@/modules/stories';
import { clockOf } from '@/shared/calendar';
import { portraitUrl } from '@/shared/portrait';
import { VerifiedBadge } from '@/ui/howdy';
import { MemoriesCard } from './memories-card';
import { PorchLightCard } from './porch-light-card';
import { StoriesStrip } from './stories-strip';

export const metadata = { title: 'Home' };

const SECTION_TITLE =
  'flex items-center gap-1.5 text-metadata font-semibold tracking-wider text-text-secondary uppercase';

/**
 * First protected page: Stories, then your friends' posts; Free to talk on the right. The counts (friend requests,
 * messages, visitors) are beside the menu and the bell, on every page. The session check happens on the server: an
 * unauthenticated request never reaches the markup.
 */
export default async function HomePage() {
  const user = await requireUser();
  // Independent lookups, asked for together rather than one after another. Everything but your own profile is
  // best-effort: Home never fails because one part could not be read.
  const [ranch, photo, lists, news, memories, lit, mine, ring, feed] = await Promise.all([
    getOwnRanch(user.id),
    getPortraitVersion(user.id, { userId: user.id }).catch(() => null),
    // For the announcement below: whether this person has muted the Howdy team.
    listMyRelationships(user.id).then((r) => withCards(r, user.id)),
    getTeamAnnouncement().catch(() => null),
    memoriesToday(user.id).catch(() => null),
    // Porch Lights (ADR-032): without them Home just shows the switch.
    litPals(user.id).catch(() => []),
    myLight(user.id).catch(() => null),
    // Stories (ADR-047).
    storyRing(user.id).catch(() => []),
    listFriendsFeed(user.id, { rateKey: user.id }).catch(() => null),
  ]);
  // One look-up for every photo on the page, whoever it belongs to.
  await attachPortraits(user.id, [
    ...ring.map((r) => r.person),
    ...(memories?.pals.map((p) => p.pal) ?? []),
    ...lit.map((l) => l.pal),
    ...(feed?.cards.flatMap((c) => [c.author, c.wall, ...c.replies.map((r) => r.author)]) ?? []),
  ]);
  const litRows = lit.map((l) => ({ ...l.pal, note: l.note, untilLabel: clockOf(l.until) }));
  const myLightState = mine
    ? { audience: mine.audience, note: mine.note, untilLabel: clockOf(mine.until) }
    : null;
  // The Howdy team's current Signal ("what's new"), unless this person has turned the team's noise down.
  const announcement = news && !lists.muted.some((m) => m.handle === news.author.handle) ? news : null;

  return (
    // Two columns from xl up (1280 px; any narrower and the main column would be phone-thin): the main column right
    // beside the sidebar, and a right sidebar (Free to talk) that stays in view. Below xl the right column's card simply
    // follows the main ones. No side padding of its own: the shell's px-4 is the gutter, so the cards use the full phone
    // width.
    <div className="flex w-full flex-col gap-4 py-4 sm:gap-6 sm:py-8 xl:grid xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
      <main id="main" className="flex w-full max-w-2xl min-w-0 flex-col gap-4 sm:gap-6">
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
        {announcement && (
          <section aria-labelledby="whats-new" className="clay flex flex-col gap-2 bg-info/25 p-4 sm:p-5">
            <h2 id="whats-new" className={SECTION_TITLE}>
              What’s new on Howdy
            </h2>
            <p className="text-body break-words text-text-primary">{announcement.text}</p>
            <p className="text-caption text-text-secondary">
              <Link href={`/profile/${announcement.author.handle}`} className="font-semibold">
                {announcement.author.displayName}
              </Link>
              {announcement.author.verified && <VerifiedBadge className="ml-1" />}
            </p>
          </section>
        )}
        {memories && <MemoriesCard memories={memories} handle={user.handle} />}
        {feed ? (
          <FenceSection
            feed
            signedIn
            initial={{
              ...feed,
              // A feed is not one wall: nothing to post to here, and no wall of yours to review.
              isOwner: false,
              canPost: false,
              canAddPhoto: false,
              review: false,
            }}
          />
        ) : (
          <p className="text-caption text-text-secondary">Friends’ posts could not be loaded just now.</p>
        )}
      </main>

      {/* The right sidebar. top-24 clears the sticky top bar (4rem) with room to breathe. */}
      <aside aria-label="Free to talk" className="flex min-w-0 flex-col gap-4 sm:gap-6 xl:sticky xl:top-24">
        <PorchLightCard lit={litRows} mine={myLightState} />
      </aside>
    </div>
  );
}
