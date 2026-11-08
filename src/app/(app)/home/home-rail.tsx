import Link from 'next/link';
import type { PersonEntry } from '@/app/_lib/social';
import type { ComingCapsule } from '@/modules/capsules';
import type { MemoriesToday } from '@/modules/memories';
import type { ThreadSummary } from '@/modules/whispers';
import { longDay } from '@/shared/calendar';
import type { PortraitTint } from '@/shared/validation/profile';
import { cn } from '@/ui/cn';
import { formatRelative, VerifiedBadge } from '@/ui/howdy';
import type { LitPalRow } from '@/ui/howdy/free-to-talk';
import { PulseDot, RAIL_CARD, RAIL_TEXT, RailCard } from '@/ui/howdy/rail-card';
import { WhisperIcon } from '@/ui/icons';
import { Avatar, buttonClasses } from '@/ui/primitives';
import { ChatLink } from './chat-dock';
import { MemoriesCard } from './memories-card';
import { FindFriendsActions, SwitchYoursOn } from './rail-actions';
import { RailRequests } from './rail-requests';

export const NAME_LINK = 'font-semibold text-text-primary no-underline hover:underline';
const iconButton =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-text-primary no-underline hover:bg-surface-sunken hover:text-text-primary';

/** How many of each the panel shows; the full lists are a link away. */
const SHOW = { free: 6, threads: 5, requests: 3, sayHi: 3 };

/** A friend, with a Message button: who is free now, or (with no messages yet) someone to say hi to. */
function FriendLine({
  person,
  line,
}: {
  person: {
    handle: string;
    displayName: string;
    portraitTint?: PortraitTint | undefined;
    portraitUrl?: string | undefined;
  };
  line: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <Avatar name={person.displayName} tint={person.portraitTint} src={person.portraitUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-card">
          <Link href={`/profile/${person.handle}`} className={NAME_LINK}>
            {person.displayName}
          </Link>
        </p>
        <p className="truncate text-metadata text-text-muted">{line}</p>
      </div>
      <ChatLink
        // Only what the window needs crosses to the browser.
        person={{
          handle: person.handle,
          displayName: person.displayName,
          portraitTint: person.portraitTint,
          portraitUrl: person.portraitUrl,
        }}
        aria-label={`Message to ${person.displayName}`}
        title="Message"
        className={iconButton}
      >
        <WhisperIcon className="size-5" />
      </ChatLink>
    </li>
  );
}

export interface Announcement {
  text: string;
  author: { handle: string; displayName: string; verified?: boolean };
}

/** The team's current "what's new" note: in the right panel on wide screens, above the feed on narrower ones. */
export function WhatsNew({ news, id, viewer }: { news: Announcement; id: string; viewer: string }) {
  // The team account itself gets a way to the note's editor, on its own Profile (2026-11-08).
  const mine = news.author.handle === viewer;
  return (
    <RailCard
      id={id}
      title="What’s new"
      lead={<PulseDot />}
      foot={
        <p className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            From{' '}
            <Link href={`/profile/${news.author.handle}`} className="font-semibold">
              {news.author.displayName}
            </Link>
            {news.author.verified && <VerifiedBadge className="ml-1" />}
          </span>
          {mine && (
            <Link
              href={`/profile/${news.author.handle}#whats-new-note`}
              aria-label="Edit the What’s new note"
              className={cn(buttonClasses({ variant: 'link' }), '-mx-1')}
            >
              Edit
            </Link>
          )}
        </p>
      }
    >
      <p className={cn(RAIL_TEXT, 'break-words')}>{news.text}</p>
    </RailCard>
  );
}

/**
 * Time Capsules' way in from Home (the page itself is only in the account menu): the next one coming to you, or an
 * invitation to seal one. Never any words: sealed ones are not even read for it.
 */
function CapsulesCard({ coming }: { coming: ComingCapsule[] }) {
  const next = coming[0];
  return (
    <RailCard
      id="rail-capsules"
      title="Time Capsules"
      {...(next ? { more: { href: '/capsules', label: 'See all' } } : {})}
      {...(next
        ? coming.length > 1
          ? { foot: <p>{coming.length - 1} more after that.</p> }
          : {}
        : {
            foot: (
              <Link href="/capsules" className={cn(buttonClasses({ variant: 'link' }), '-mx-1')}>
                Seal a Time Capsule
              </Link>
            ),
          })}
    >
      {next ? (
        <p className={RAIL_TEXT}>
          One {next.from ? `from ${next.from.displayName}` : 'from your past self'} opens on{' '}
          <strong className="font-semibold">{longDay(next.openOn)}</strong>.
        </p>
      ) : (
        <p className={RAIL_TEXT}>
          Seal a few words for your future self or a friend. Nobody can read them until the day they open.
        </p>
      )}
    </RailCard>
  );
}

/**
 * Home's right panel (wide screens only): your circle right now. The friends who switched Free to talk on (their own
 * choice; Howdy has no automatic "online" dot), your latest messages, friend requests waiting for you, then "On this day"
 * and Time Capsules. The team's note, when there is one, comes first. Everything in it is already filtered for this person by
 * the server.
 */
export function HomeRail({
  free,
  threads,
  requests,
  memories,
  capsules,
  news,
  handle,
  friends,
  myLight,
}: {
  free: LitPalRow[];
  /** All my friends, newest first: none means a new account, which gets "Find your friends" instead. */
  friends: PersonEntry[];
  /** My own Free to talk, when it is on. */
  myLight: { untilLabel: string } | null;
  threads: ThreadSummary[] | null;
  requests: PersonEntry[];
  memories: MemoriesToday | null;
  /** Time Capsules coming to me, soonest first; null when they could not be read (then no card). */
  capsules: ComingCapsule[] | null;
  news: Announcement | null;
  handle: string;
}) {
  return (
    <>
      {/* The team's note leads the panel (2026-11-07): news is read first, then your circle. */}
      {news && <WhatsNew news={news} id="rail-whats-new" viewer={handle} />}
      {friends.length === 0 ? (
        <RailCard id="rail-find" title="Find your friends">
          <p className={RAIL_TEXT}>Look people up, or send them your link.</p>
          <FindFriendsActions handle={handle} />
        </RailCard>
      ) : (
        <RailCard
          id="rail-free"
          title="Free now"
          {...(free.length === 0 && !myLight ? { foot: <SwitchYoursOn /> } : {})}
        >
          {free.length === 0 ? (
            myLight ? (
              <p className={RAIL_TEXT}>
                You’re free until <strong className="font-semibold">{myLight.untilLabel}</strong>. No one else
                yet.
              </p>
            ) : (
              <p className={RAIL_TEXT}>No one’s free right now.</p>
            )
          ) : (
            <ul aria-label="Friends free to talk" className="flex flex-col gap-3">
              {free.slice(0, SHOW.free).map((p) => (
                <FriendLine
                  key={p.handle}
                  person={p}
                  line={`until ${p.untilLabel}${p.note ? ` · “${p.note}”` : ''}`}
                />
              ))}
            </ul>
          )}
        </RailCard>
      )}

      {/* With no friends there is nobody to message: "Find your friends" covers it. */}
      {threads && friends.length > 0 && (
        <RailCard id="rail-messages" title="Messages" more={{ href: '/messages', label: 'See all' }}>
          {threads.length === 0 ? (
            <>
              <p className={RAIL_TEXT}>Say hi to a friend.</p>
              <ul aria-label="Friends to message" className="flex flex-col gap-3">
                {friends.slice(0, SHOW.sayHi).map((p) => (
                  <FriendLine key={p.handle} person={p} line={`@${p.handle}`} />
                ))}
              </ul>
            </>
          ) : (
            <ul aria-label="Latest messages" className="-mx-2 flex flex-col">
              {threads.slice(0, SHOW.threads).map((t) => (
                <li key={t.handle}>
                  <ChatLink
                    person={{
                      handle: t.handle,
                      displayName: t.displayName,
                      portraitTint: t.portraitTint,
                      portraitUrl: t.portraitUrl,
                    }}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 no-underline hover:bg-surface-sunken hover:no-underline"
                  >
                    <Avatar name={t.displayName} tint={t.portraitTint} src={t.portraitUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={
                            'min-w-0 flex-1 truncate text-card text-text-primary ' +
                            (t.unread > 0 ? 'font-bold' : 'font-semibold')
                          }
                        >
                          {t.displayName}
                        </span>
                        <span className="shrink-0 text-metadata text-text-muted">
                          {formatRelative(new Date(t.last.at))}
                        </span>
                      </span>
                      <span
                        className={
                          'block truncate text-metadata ' +
                          (t.unread > 0 ? 'text-text-primary' : 'text-text-secondary')
                        }
                      >
                        {t.last.mine ? 'You: ' : ''}
                        {t.last.body}
                      </span>
                    </span>
                    {t.unread > 0 && (
                      // How many unread, the same sunflower count as Messages in the menu.
                      <span className="grid min-w-5 shrink-0 place-items-center rounded-pill bg-highlight px-1.5 text-metadata font-bold text-on-highlight">
                        {t.unread > 99 ? '99+' : t.unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </ChatLink>
                </li>
              ))}
            </ul>
          )}
        </RailCard>
      )}

      {requests.length > 0 && (
        <RailCard
          id="rail-requests"
          title={`Friend requests (${requests.length})`}
          {...(requests.length > SHOW.requests ? { more: { href: '/friends', label: 'See all' } } : {})}
        >
          <RailRequests people={requests.slice(0, SHOW.requests)} />
        </RailCard>
      )}

      {memories && (
        <MemoriesCard memories={memories} handle={handle} className={RAIL_CARD} headingId="rail-memories" />
      )}
      {capsules && <CapsulesCard coming={capsules} />}
    </>
  );
}
