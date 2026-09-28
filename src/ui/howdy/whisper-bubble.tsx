import { cn } from '../cn';

export type WhisperStatus = 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';

const STATUS_LABEL: Record<WhisperStatus, string> = {
  sending: 'Sending…',
  sent: 'Sent',
  delivered: 'Delivered',
  seen: 'Seen',
  failed: 'Not sent',
};

/**
 * One Whisper message (max 280 chars). Outgoing bubbles carry a delivery status in text, not just colour: "11:00 AM · Seen".
 * The time sits in the bubble's bottom-right corner; an invisible spacer as wide as it ends the text, so a short message and
 * its time share one line and a long one wraps clear of it.
 */
export function WhisperBubble({
  direction,
  body,
  time,
  status,
}: {
  direction: 'in' | 'out';
  body: string;
  /** Preformatted, e.g. "10:14 PM". */
  time: string;
  status?: WhisperStatus;
}) {
  const out = direction === 'out';
  const shown = out ? status : undefined;
  const sep = time && shown ? ' · ' : '';
  // The spacer's width comes from CSS content, not text, so the time is never in the page twice.
  const spacer = `${time}${sep}${shown ? STATUS_LABEL[shown] : ''}`;
  return (
    <div className={cn('flex', out ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative max-w-[85%] rounded-lg px-3 py-1.5',
          out
            ? 'rounded-br-sm bg-accent text-on-accent shadow-clay-sm'
            : 'rounded-bl-sm bg-surface text-text-primary shadow-clay-sm',
        )}
      >
        <p className="text-caption font-normal break-words whitespace-pre-wrap">
          <span className="sr-only">{out ? 'You said: ' : 'They said: '}</span>
          {body}
          <span
            aria-hidden="true"
            data-meta={spacer}
            className={cn(
              'invisible ml-2 text-tab whitespace-nowrap after:content-[attr(data-meta)]',
              shown === 'failed' && 'font-bold',
            )}
          />
        </p>
        <p
          className={cn(
            'absolute right-3 bottom-1 text-tab whitespace-nowrap',
            out ? 'text-on-accent' : 'text-text-muted',
            shown === 'failed' && 'font-bold',
          )}
        >
          <span>{time}</span>
          {sep}
          {shown && <span>{STATUS_LABEL[shown]}</span>}
        </p>
      </div>
    </div>
  );
}
