import Link from 'next/link';
import { attachPortraits, withCards } from '@/app/_lib/social';
import { Art, type ArtName } from '@/ui/art/glyph';
import { listMySessions, requireUser } from '@/modules/auth';
import { litPals, myLight } from '@/modules/lights';
import { getPortraitVersion } from '@/modules/media';
import { memoriesToday } from '@/modules/memories';
import { unreadCount } from '@/modules/notifications';
import { getOwnRanch, getTeamAnnouncement } from '@/modules/profiles';
import { listMyRelationships } from '@/modules/relationships';
import { listTracks } from '@/modules/tracks';
import { unreadThreads } from '@/modules/whispers';
import { portraitUrl } from '@/shared/portrait';
import { cn } from '@/ui/cn';
import { VerifiedBadge } from '@/ui/howdy';
import { Avatar, buttonClasses, ClayCard } from '@/ui/primitives';
import { clockOf } from '@/shared/calendar';
import { OpenGates } from './home-actions';
import { MemoriesCard } from './memories-card';
import { PorchLightCard } from './porch-light-card';

export const metadata = { title: 'Home' };

const SECTION_TITLE =
  'flex items-center gap-1.5 text-metadata font-semibold tracking-wider text-text-secondary uppercase';

interface Glance {
  href: string;
  art: ArtName;
  /** null = nothing to count right now (the note says why). */
  value: number | null;
  label: string;
  /** A short second line: what needs you, or why there is no number. */
  note?: string | undefined;
  /** Something is waiting for you here: the number is highlighted. */
  waiting?: boolean;
}

/** First protected page. The session check happens on the server: an unauthenticated request never reaches the markup. */
export default async function HomePage() {
  const user = await requireUser();
  // Independent lookups, asked for together rather than one after another. Every count is best-effort (Home never
  // fails because one number could not be read) and comes from the same function its own page uses, so the number
  // here always agrees with what that page shows (held Whispers, muted people, blocks and Shadow Walk included).
  const [ranch, photo, lists, sessions, news, memories, lit, mine, whispers, chimes, tracks] =
    await Promise.all([
      getOwnRanch(user.id),
      getPortraitVersion(user.id).catch(() => null),
      // Only requests from people who are still active count (a suspended account's request is not shown or counted).
      listMyRelationships(user.id).then(withCards),
      listMySessions(),
      getTeamAnnouncement().catch(() => null),
      memoriesToday(user.id).catch(() => null),
      // Porch Lights (ADR-032): without them Home just shows the switch.
      litPals(user.id).catch(() => []),
      myLight(user.id).catch(() => null),
      unreadThreads(user.id).catch(() => null),
      unreadCount(user.id).catch(() => null),
      listTracks(user.id).catch(() => null),
    ]);
  // One look-up for every photo on the page, whoever it belongs to.
  await attachPortraits(user.id, [...(memories?.pals.map((p) => p.pal) ?? []), ...lit.map((l) => l.pal)]);
  const litRows = lit.map((l) => ({ ...l.pal, note: l.note, untilLabel: clockOf(l.until) }));
  const myLightState = mine
    ? { audience: mine.audience, note: mine.note, untilLabel: clockOf(mine.until) }
    : null;
  const requests = lists.incoming.length;
  // The Howdy team's current Signal ("what's new"), unless this person has turned the team's noise down.
  const announcement = news && !lists.muted.some((m) => m.handle === news.author.handle) ? news : null;
  const gates = sessions.map((s) => ({
    id: s.id,
    deviceLabel: s.deviceLabel,
    lastSeenAt: s.lastSeenAt.toISOString(),
    current: s.current,
  }));
  const visitsToday = tracks
    ? tracks.people.filter((p) => p.when === 'today').length + tracks.hidden.today
    : null;

  const glance: Glance[] = [
    {
      href: '/whispers',
      art: 'nav-whispers',
      value: whispers,
      label: whispers === 1 ? 'Unread Whisper' : 'Unread Whispers',
      waiting: (whispers ?? 0) > 0,
    },
    {
      href: '/chimes',
      art: 'nav-chimes',
      value: chimes,
      label: chimes === 1 ? 'New Chime' : 'New Chimes',
      waiting: (chimes ?? 0) > 0,
    },
    {
      href: '/pals',
      art: 'nav-pals',
      value: lists.posse.length,
      label: lists.posse.length === 1 ? 'Pal' : 'Pals',
      note: requests > 0 ? `${requests} ${requests === 1 ? 'request' : 'requests'} waiting` : undefined,
      waiting: requests > 0,
    },
    {
      href: '/tracks',
      art: 'nav-tracks',
      // On Shadow Walk your own Tracks are frozen, so there is honestly nothing to count.
      value: tracks?.frozen ? null : visitsToday,
      label: 'Porch visits today',
      note: tracks?.frozen ? 'Shadow Walk is on' : undefined,
    },
  ];

  return (
    <>
      {/* No side padding of its own: the shell's px-4 is the gutter, so the cards use the full phone width. */}
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
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

          {/* A few numbers worth a glance, each a way into the page that has the detail. */}
          <section aria-labelledby="glance" className="flex flex-col gap-2">
            <h2 id="glance" className={SECTION_TITLE}>
              At a glance
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {glance.map((g) => (
                <li key={g.href}>
                  <Link
                    href={g.href}
                    className={cn(
                      'flex h-full min-h-11 flex-col gap-1 rounded-lg p-3 no-underline transition-colors hover:no-underline',
                      g.waiting
                        ? 'bg-accent/15 hover:bg-accent/25'
                        : 'bg-surface-sunken hover:bg-surface-sunken/70',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-heading font-semibold text-text-primary tabular-nums">
                        {g.value === null ? '–' : g.value > 99 ? '99+' : g.value}
                      </span>
                      <Art name={g.art} size="free" className="size-7 shrink-0" />
                    </span>
                    <span className="text-caption leading-tight text-text-primary">{g.label}</span>
                    {g.note && (
                      <span
                        className={cn(
                          'text-metadata leading-tight',
                          g.waiting ? 'font-semibold text-text-primary' : 'text-text-secondary',
                        )}
                      >
                        {g.note}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <Link href={`/porch/${user.handle}`} className={cn(buttonClasses({ size: 'sm' }), 'self-start')}>
            Visit your Porch
          </Link>
        </ClayCard>
        <PorchLightCard lit={litRows} mine={myLightState} />
        {announcement && (
          <section aria-labelledby="whats-new" className="clay flex flex-col gap-2 bg-info/25 p-4 sm:p-5">
            <h2 id="whats-new" className={SECTION_TITLE}>
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
        <OpenGates initial={gates} />
      </main>
    </>
  );
}
