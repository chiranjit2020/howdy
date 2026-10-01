import Link from 'next/link';
import type { PersonEntry } from '@/app/_lib/social';
import { Art, Glyph } from '@/ui/art/glyph';
import { BoltIcon } from '@/ui/icons';
import { GlossaryHint } from '@/ui/howdy';
import { Avatar, buttonClasses, ClayCard } from '@/ui/primitives';

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
    <ClayCard className="flex flex-col gap-3 bg-warning/20">
      <h2 className="flex items-center gap-2 font-display text-title text-brand-ink">
        <Glyph emoji="💡" size="free" className="size-7" />
        Porch Light on
      </h2>
      <p className="text-body break-words text-text-primary">
        {owner
          ? `Your light is on until ${untilLabel}, for ${audience === 'close' ? 'your Close Pals' : 'all your Pals'}.`
          : `${displayName} is free to talk until ${untilLabel}.`}
        {note && <span className="mt-1 block text-caption text-text-secondary">“{note}”</span>}
      </p>
      {owner ? (
        <Link href="/home" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
          Change it on Home
        </Link>
      ) : (
        <Link href={`/whispers/${handle}`} className={buttonClasses({ size: 'sm' })}>
          Whisper
        </Link>
      )}
    </ClayCard>
  );
}

/** The Signal, a short status that expires on its own. Mint-tinted so it reads as "live" beside the Fence. */
export function SignalCard({ text, expiresLabel }: { text: string; expiresLabel: string }) {
  return (
    <ClayCard className="flex flex-col gap-3 bg-success/30">
      <div className="flex items-center">
        <h2 className="flex items-center gap-3 font-display text-title text-brand-ink">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-pill bg-success text-heading text-on-success"
          >
            <BoltIcon />
          </span>
          Signal
        </h2>
        <GlossaryHint term="signal" />
      </div>
      {/* One paragraph: what it says and how long it lasts belong together. */}
      <p className="text-body break-words text-text-primary">
        <span className="sr-only">Signal: </span>
        {text}
        <span className="mt-1 block font-mono text-metadata text-text-secondary">{expiresLabel}</span>
      </p>
    </ClayCard>
  );
}

/**
 * Owner only: the way to your Tracks (who stopped by your Porch). Tracks has no tab on phones, so it lives here, next
 * to the rest of what is yours.
 */
export function TracksCard() {
  return (
    <ClayCard className="flex flex-col gap-3 bg-info/25">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center">
          <h2 className="flex items-center gap-3 font-display text-title text-brand-ink">
            <Art name="nav-tracks" size="free" className="size-9" />
            Tracks
          </h2>
          <GlossaryHint term="tracks" />
        </div>
        <Link href="/tracks" className="inline-flex min-h-11 items-center text-caption text-auth-link">
          Open
        </Link>
      </div>
      <p className="text-caption text-text-secondary">See who stopped by your Porch this week.</p>
    </ClayCard>
  );
}

/** Owner only: who is in your Posse. People, never counts of strangers; the full list lives on the Posse page. */
export function PosseCard({ members }: { members: PersonEntry[] }) {
  const shown = members.slice(0, 4);
  const more = members.length - shown.length;
  return (
    <ClayCard className="flex flex-col gap-4 bg-mystery/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center">
          <h2 className="flex items-center gap-3 font-display text-title text-brand-ink">
            <Art name="nav-pals" size="free" className="size-9" />
            Pals
          </h2>
          <GlossaryHint term="posse" />
        </div>
        <Link href="/pals" className="inline-flex min-h-11 items-center text-caption text-auth-link">
          View all
        </Link>
      </div>
      {shown.length > 0 ? (
        <>
          <ul className="flex items-center" aria-label="Some of your Pals">
            {shown.map((m) => (
              <li key={m.handle} className="-ml-2 first:ml-0">
                <Link
                  href={`/porch/${m.handle}`}
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
          <p className="text-caption text-text-secondary">
            {members.length} {members.length === 1 ? 'Pal' : 'Pals'}
          </p>
        </>
      ) : (
        <p className="text-caption text-text-secondary">Nobody yet. Ask someone from the Pals page.</p>
      )}
    </ClayCard>
  );
}
