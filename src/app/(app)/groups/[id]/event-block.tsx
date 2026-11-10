'use client';

import type { HallAuthor, HallEventView } from '@/modules/town-halls';
import { RSVP_ANSWERS, type RsvpAnswer } from '@/shared/validation/town-halls';
import { Chip } from '@/ui/primitives';

/** Dates arrive as Date objects (first paint) or ISO strings (later pages). */
export type WireEvent = Omit<HallEventView, 'startsAt'> & { startsAt: Date | string };

const ANSWER_LABEL: Record<RsvpAnswer, string> = { going: 'Going', maybe: 'Maybe', no: 'Can’t go' };

/** Howdy's calendar (Asia/Kolkata), the same on the server and in every browser, so nothing shifts after loading. */
const inIndia = (d: Date | string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...opts }).format(new Date(d));

/** "Sun, 14 Dec, 6:00 pm" */
export const eventWhen = (d: Date | string) =>
  inIndia(d, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * An event inside its post (ADR-056): a calendar tile, its name, when and where, how many are going, and the three
 * answers as toggles (tap yours again to take it back). The organiser alone also sees who answered what.
 */
export function EventBlock({
  event,
  onAnswer,
  busy,
}: {
  event: WireEvent;
  onAnswer: (answer: RsvpAnswer | null) => void;
  busy: boolean;
}) {
  const { counts } = event;
  return (
    <section
      aria-label={`Event: ${event.title}`}
      className="flex flex-col gap-3 rounded-card border border-card-edge bg-surface-sunken/50 p-3 shadow-clay"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex w-12 shrink-0 flex-col overflow-hidden rounded-md border border-border bg-surface text-center"
        >
          <span className="bg-highlight py-0.5 text-metadata font-semibold text-on-highlight uppercase">
            {inIndia(event.startsAt, { month: 'short' })}
          </span>
          <span className="py-1 text-title font-semibold text-text-primary">
            {inIndia(event.startsAt, { day: 'numeric' })}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold break-words text-text-primary">{event.title}</p>
          <p className="text-caption break-words text-text-secondary">
            <time dateTime={new Date(event.startsAt).toISOString()}>{eventWhen(event.startsAt)}</time>
            {event.place && ` · ${event.place}`}
          </p>
          <p className="text-caption text-text-secondary">
            {counts.going} going · {counts.maybe} maybe
            {counts.no > 0 && ` · ${counts.no} can’t go`}
          </p>
        </div>
      </div>
      {event.closed ? (
        <p className="text-caption text-text-secondary">This event has started.</p>
      ) : (
        <div role="group" aria-label="Your answer" className="flex flex-wrap gap-2">
          {RSVP_ANSWERS.map((a) => (
            <Chip
              key={a}
              selected={event.mine === a}
              disabled={busy}
              onSelect={() => onAnswer(event.mine === a ? null : a)}
            >
              {ANSWER_LABEL[a]}
            </Chip>
          ))}
        </div>
      )}
      {event.answers && RSVP_ANSWERS.some((a) => event.answers![a].length > 0) && (
        // The organiser's list: a native <details>, closed until wanted.
        <details className="text-caption">
          <summary className="min-h-11 cursor-pointer font-semibold text-text-primary pointer-fine:min-h-0">
            Who answered
          </summary>
          <dl className="mt-2 flex flex-col gap-1.5">
            {RSVP_ANSWERS.filter((a) => event.answers![a].length > 0).map((a) => (
              <div key={a}>
                <dt className="inline font-semibold text-text-primary">{ANSWER_LABEL[a]}: </dt>
                <dd className="inline text-text-secondary">{names(event.answers![a])}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}

const names = (people: HallAuthor[]) => people.map((p) => p.displayName).join(', ');
