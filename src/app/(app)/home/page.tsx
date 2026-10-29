import type { ReactNode } from 'react';
import Link from 'next/link';
import { attachPortraits, withCards } from '@/app/_lib/social';
import { BellIcon, TracksIcon, UsersIcon, WhisperIcon } from '@/ui/icons';
import { requireUser } from '@/modules/auth';
import { litPals, myLight } from '@/modules/lights';
import { getPortraitVersion } from '@/modules/media';
import { memoriesToday } from '@/modules/memories';
import { unreadCount } from '@/modules/notifications';
import { getOwnRanch, getTeamAnnouncement } from '@/modules/profiles';
import { listMyRelationships } from '@/modules/relationships';
import { storyRing } from '@/modules/stories';
import { listTracks } from '@/modules/tracks';
import { unreadThreads } from '@/modules/whispers';
import { portraitUrl } from '@/shared/portrait';
import { cn } from '@/ui/cn';
import { VerifiedBadge } from '@/ui/howdy';
import { Avatar, buttonClasses, ClayCard } from '@/ui/primitives';
import { clockOf } from '@/shared/calendar';
import { MemoriesCard } from './memories-card';
import { PorchLightCard } from './porch-light-card';
import { StoriesStrip } from './stories-strip';

export const metadata = { title: 'Home' };

const SECTION_TITLE =
  'flex items-center gap-1.5 text-metadata font-semibold tracking-wider text-text-secondary uppercase';

interface Glance {
  href: string;
  icon: ReactNode;
  /** null = nothing to count right now (`spoken` says why). */
  value: number | null;
  /** One or two words: the row is a single line. */
  label: string;
  /** The whole thing in a sentence, for screen readers and as the hover title ("4 friends, 2 requests waiting"). */
  spoken: string;
  /** Something is waiting for you here: the number turns sunflower. */
  waiting?: boolean;
  /** A tiny sunflower extra after the label, e.g. "+2" friend requests. */
  extra?: string | undefined;
}

/** First protected page. The session check happens on the server: an unauthenticated request never reaches the markup. */
export default async function HomePage() {
  const user = await requireUser();
  // Independent lookups, asked for together rather than one after another. Every count is best-effort (Home never
  // fails because one number could not be read) and comes from the same function its own page uses, so the number
  // here always agrees with what that page shows (held Whispers, muted people, blocks and Shadow Walk included).
  const [ranch, photo, lists, news, memories, lit, mine, whispers, chimes, tracks] = await Promise.all([
    getOwnRanch(user.id),
    getPortraitVersion(user.id, { userId: user.id }).catch(() => null),
    // Only requests from people who are still active count (a suspended account's request is not shown or counted).
    listMyRelationships(user.id).then((r) => withCards(r, user.id)),
    getTeamAnnouncement().catch(() => null),
    memoriesToday(user.id).catch(() => null),
    // Porch Lights (ADR-032): without them Home just shows the switch.
    litPals(user.id).catch(() => []),
    myLight(user.id).catch(() => null),
    unreadThreads(user.id).catch(() => null),
    unreadCount(user.id).catch(() => null),
    listTracks(user.id).catch(() => null),
  ]);
  // Stories (ADR-047): best-effort, like everything else on Home.
  const ring = await storyRing(user.id).catch(() => []);
  // One look-up for every photo on the page, whoever it belongs to.
  await attachPortraits(user.id, [
    ...ring.map((r) => r.person),
    ...(memories?.pals.map((p) => p.pal) ?? []),
    ...lit.map((l) => l.pal),
  ]);
  const litRows = lit.map((l) => ({ ...l.pal, note: l.note, untilLabel: clockOf(l.until) }));
  const myLightState = mine
    ? { audience: mine.audience, note: mine.note, untilLabel: clockOf(mine.until) }
    : null;
  const requests = lists.incoming.length;
  // The Howdy team's current Signal ("what's new"), unless this person has turned the team's noise down.
  const announcement = news && !lists.muted.some((m) => m.handle === news.author.handle) ? news : null;
  const visitsToday = tracks
    ? tracks.people.filter((p) => p.when === 'today').length + tracks.hidden.today
    : null;

  const count = (n: number | null, one: string, many: string) =>
    n === null ? `No ${many}` : `${n} ${n === 1 ? one : many}`;
  const glance: Glance[] = [
    {
      href: '/messages',
      icon: <WhisperIcon />,
      value: whispers,
      label: 'Messages',
      spoken: count(whispers, 'unread message', 'unread messages'),
      waiting: (whispers ?? 0) > 0,
    },
    {
      href: '/notifications',
      icon: <BellIcon />,
      value: chimes,
      label: 'Notifications',
      spoken: count(chimes, 'new notification', 'new notifications'),
      waiting: (chimes ?? 0) > 0,
    },
    {
      href: '/friends',
      icon: <UsersIcon />,
      value: lists.posse.length,
      label: 'Friends',
      spoken:
        count(lists.posse.length, 'friend', 'friends') +
        (requests > 0 ? `, ${requests} ${requests === 1 ? 'request' : 'requests'} waiting` : ''),
      extra: requests > 0 ? `+${requests > 99 ? '99' : requests}` : undefined,
    },
    {
      href: '/visitors',
      icon: <TracksIcon />,
      // On Shadow Walk your own Tracks are frozen, so there is honestly nothing to count.
      value: tracks?.frozen ? null : visitsToday,
      label: 'Visits today',
      spoken: tracks?.frozen
        ? 'Profile visits: private browsing is on'
        : count(visitsToday, 'profile visit today', 'profile visits today'),
    },
  ];

  return (
    // Two columns from xl up (1280 px; any narrower and the main column would be phone-thin): the main column right
    // beside the sidebar, and a right sidebar (At a glance, Free to talk) that stays in view. Below xl the right column's
    // cards simply follow the main ones. No side padding of its own: the shell's px-4 is the gutter, so the cards use the
    // full phone width.
    <div className="flex w-full flex-col gap-4 py-4 sm:gap-6 sm:py-8 xl:grid xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
      <main id="main" className="flex w-full max-w-2xl min-w-0 flex-col gap-4 sm:gap-6">
        <StoriesStrip
          initial={ring}
          me={{
            handle: user.handle,
            displayName: ranch.displayName,
            portraitTint: ranch.portraitTint,
            ...(photo ? { portraitUrl: portraitUrl(user.handle, photo) } : {}),
          }}
        />
        <ClayCard className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <Avatar
              name={ranch.displayName}
              tint={ranch.portraitTint}
              src={photo ? portraitUrl(user.handle, photo) : null}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-heading [overflow-wrap:anywhere] text-text-primary">
                Howdy, {ranch.displayName}
              </h1>
              <p className="text-caption [overflow-wrap:anywhere] text-text-secondary">@{user.handle}</p>
            </div>
          </div>
          <Link href={`/profile/${user.handle}`} className={cn(buttonClasses({ size: 'sm' }), 'self-start')}>
            Visit your profile
          </Link>
        </ClayCard>
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
      </main>

      {/* The right sidebar. top-24 clears the sticky top bar (4rem) with room to breathe. */}
      <aside
        aria-label="At a glance and Free to talk"
        className="flex min-w-0 flex-col gap-4 sm:gap-6 xl:sticky xl:top-24"
      >
        {/* A few numbers worth a glance, each a way into the page that has the detail: one line each, two by two. */}
        <ClayCard className="border-t-4 border-t-highlight p-3 sm:p-4">
          <section aria-labelledby="glance" className="flex flex-col gap-1">
            <h2 id="glance" className={cn(SECTION_TITLE, 'px-2')}>
              At a glance
            </h2>
            <ul className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-1">
              {glance.map((g) => (
                <li key={g.href}>
                  <Link
                    href={g.href}
                    aria-label={g.spoken}
                    title={g.spoken}
                    className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-text-primary no-underline transition-colors hover:bg-surface-sunken hover:no-underline"
                  >
                    <span aria-hidden="true" className="flex shrink-0 text-body text-text-secondary">
                      {g.icon}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-body font-semibold tabular-nums',
                        g.waiting &&
                          'rounded-pill bg-highlight px-1.5 text-caption font-bold text-on-highlight',
                      )}
                    >
                      {g.value === null ? '–' : g.value > 99 ? '99+' : g.value}
                    </span>
                    <span className="min-w-0 truncate text-caption">{g.label}</span>
                    {g.extra && (
                      <span className="shrink-0 rounded-pill bg-highlight px-1.5 text-metadata font-bold text-on-highlight">
                        {g.extra}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </ClayCard>
        <PorchLightCard lit={litRows} mine={myLightState} />
      </aside>
    </div>
  );
}
