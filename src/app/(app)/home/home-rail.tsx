import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PersonEntry } from '@/app/_lib/social';
import type { MemoriesToday } from '@/modules/memories';
import type { ThreadSummary } from '@/modules/whispers';
import type { PortraitTint } from '@/shared/validation/profile';
import { formatRelative, VerifiedBadge } from '@/ui/howdy';
import type { LitPalRow } from '@/ui/howdy/free-to-talk';
import { WhisperIcon } from '@/ui/icons';
import { Avatar } from '@/ui/primitives';
import { MemoriesCard } from './memories-card';
import { FindFriendsActions, SwitchYoursOn } from './rail-actions';
import { RailRequests } from './rail-requests';

// A 6 px "caution tape" stripe along the top: violet and sunflower at 45 degrees (a trial look).
export const RAIL_CARD =
  'relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-surface p-4 pt-6 ' +
  'before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:content-[""] ' +
  'before:bg-[repeating-linear-gradient(-45deg,var(--color-accent)_0_8px,var(--color-highlight)_8px_16px)]';
const RAIL_TITLE = 'text-metadata font-semibold tracking-wider text-text-secondary uppercase';
const RAIL_MORE = 'text-caption font-semibold';
export const NAME_LINK = 'font-semibold text-text-primary no-underline hover:underline';
const iconButton =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-text-secondary no-underline hover:bg-surface-sunken hover:text-text-primary';

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
    <li className="flex items-center gap-2.5">
      <Avatar name={person.displayName} tint={person.portraitTint} src={person.portraitUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-caption">
          <Link href={`/profile/${person.handle}`} className={NAME_LINK}>
            {person.displayName}
          </Link>
        </p>
        <p className="truncate text-metadata text-text-secondary">{line}</p>
      </div>
      <Link
        href={`/messages/${person.handle}`}
        aria-label={`Message to ${person.displayName}`}
        title="Message"
        className={iconButton}
      >
        <WhisperIcon className="size-5" />
      </Link>
    </li>
  );
}

export interface Announcement {
  text: string;
  author: { handle: string; displayName: string; verified?: boolean };
}

function RailCard({
  id,
  title,
  more,
  children,
}: {
  id: string;
  title: string;
  more?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={RAIL_CARD}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id} className={RAIL_TITLE}>
          {title}
        </h2>
        {more && (
          <Link href={more.href} className={RAIL_MORE}>
            {more.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** The team's current "what's new" note: in the right panel on wide screens, above the feed on narrower ones. */
export function WhatsNew({ news, id }: { news: Announcement; id: string }) {
  return (
    <RailCard id={id} title="What’s new on Howdy">
      <p className="text-caption break-words text-text-primary">{news.text}</p>
      <p className="text-metadata text-text-secondary">
        <Link href={`/profile/${news.author.handle}`} className="font-semibold">
          {news.author.displayName}
        </Link>
        {news.author.verified && <VerifiedBadge className="ml-1" />}
      </p>
    </RailCard>
  );
}

/**
 * Home's right panel (wide screens only): your circle right now. The friends who switched Free to talk on (their own
 * choice; Howdy has no automatic "online" dot), your latest messages, friend requests waiting for you, then "On this
 * day" and the team's note. Everything in it is already filtered for this person by the server.
 */
export function HomeRail({
  free,
  threads,
  requests,
  memories,
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
  news: Announcement | null;
  handle: string;
}) {
  return (
    <>
      {friends.length === 0 ? (
        <RailCard id="rail-find" title="Find your friends">
          <p className="text-caption text-text-secondary">
            Howdy is better with the people you know. Look them up, or send them your profile link.
          </p>
          <FindFriendsActions handle={handle} />
        </RailCard>
      ) : (
        <RailCard id="rail-free" title="Free now">
          {free.length === 0 ? (
            myLight ? (
              <p className="text-caption text-text-secondary">
                You’re free until{' '}
                <strong className="font-semibold text-text-primary">{myLight.untilLabel}</strong>. No friend
                is free yet.
              </p>
            ) : (
              <>
                <p className="text-caption text-text-secondary">
                  No friend is free right now. Let them know when you are.
                </p>
                <SwitchYoursOn />
              </>
            )
          ) : (
            <ul aria-label="Friends free to talk" className="-my-1 flex flex-col">
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
              <p className="text-caption text-text-secondary">No messages yet. Say hi to a friend.</p>
              <ul aria-label="Friends to message" className="-my-1 flex flex-col">
                {friends.slice(0, SHOW.sayHi).map((p) => (
                  <FriendLine key={p.handle} person={p} line={`@${p.handle}`} />
                ))}
              </ul>
            </>
          ) : (
            <ul aria-label="Latest messages" className="-mx-2 flex flex-col">
              {threads.slice(0, SHOW.threads).map((t) => (
                <li key={t.handle}>
                  <Link
                    href={`/messages/${t.handle}`}
                    className="flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1.5 no-underline hover:bg-surface-sunken hover:no-underline"
                  >
                    <Avatar name={t.displayName} tint={t.portraitTint} src={t.portraitUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={
                            'min-w-0 flex-1 truncate text-caption text-text-primary ' +
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
                  </Link>
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
      {news && <WhatsNew news={news} id="rail-whats-new" />}
    </>
  );
}
