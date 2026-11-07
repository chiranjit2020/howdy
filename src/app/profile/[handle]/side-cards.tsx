import Link from 'next/link';
import type { PersonEntry } from '@/app/_lib/social';
import { RAIL_TEXT, RailCard } from '@/ui/howdy/rail-card';
import { cn } from '@/ui/cn';
import { Avatar } from '@/ui/primitives';

/**
 * Porch Light (ADR-032): shown to a Pal it is on for, with a way to start talking; and to the owner, as a reminder that it
 * is on. Never says who else can see it.
 */
export function PorchLightNotice({
  owner,
  displayName,
  handle,
  untilLabel,
  note,
  audience,
}: {
  owner: boolean;
  displayName: string;
  handle: string;
  untilLabel: string;
  note: string | null;
  audience?: 'pals' | 'close';
}) {
  return (
    <RailCard
      id="free-to-talk"
      title="Free to talk"
      more={
        owner ? { href: '/home', label: 'Change on Home' } : { href: `/messages/${handle}`, label: 'Message' }
      }
      {...(note ? { foot: <p className="break-words">“{note}”</p> } : {})}
    >
      <p className={cn(RAIL_TEXT, 'break-words')}>
        {owner
          ? `Your light is on until ${untilLabel}, for ${audience === 'close' ? 'your close friends' : 'all your friends'}.`
          : `${displayName} is free to talk until ${untilLabel}.`}
      </p>
    </RailCard>
  );
}

/**
 * Owner only: the way to your Tracks (who stopped by your Porch). Tracks has no tab on phones, so it lives here, next
 * to the rest of what is yours.
 */
export function TracksCard() {
  return (
    <RailCard id="profile-visitors" title="Profile visitors" more={{ href: '/visitors', label: 'Open' }}>
      <p className={RAIL_TEXT}>See who stopped by your profile this week.</p>
    </RailCard>
  );
}

/** Owner only: who is in your Posse. People, never counts of strangers; the full list lives on the Posse page. */
export function PosseCard({ members }: { members: PersonEntry[] }) {
  const shown = members.slice(0, 4);
  const more = members.length - shown.length;
  return (
    <RailCard id="your-friends" title="Friends" more={{ href: '/friends', label: 'View all' }}>
      {shown.length > 0 ? (
        <div className="flex items-center gap-3">
          <ul className="flex items-center" aria-label="Some of your friends">
            {shown.map((m) => (
              <li key={m.handle} className="-ml-2 first:ml-0">
                <Link
                  href={`/profile/${m.handle}`}
                  aria-label={`${m.displayName}, @${m.handle}`}
                  className="rounded-pill"
                >
                  <Avatar name={m.displayName} tint={m.portraitTint} src={m.portraitUrl} size="md" />
                </Link>
              </li>
            ))}
            {more > 0 && (
              <li className="-ml-2 grid size-11 place-items-center rounded-pill border-2 border-surface bg-surface-sunken text-metadata font-semibold text-text-primary">
                +{more}
                <span className="sr-only"> more</span>
              </li>
            )}
          </ul>
          <p className={RAIL_TEXT}>
            {members.length} {members.length === 1 ? 'friend' : 'friends'}
          </p>
        </div>
      ) : (
        <p className={RAIL_TEXT}>Nobody yet. Ask someone from the friends page.</p>
      )}
    </RailCard>
  );
}
