import { cn } from '../cn';

export type WhisperStatus = 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';

const STATUS_LABEL: Record<WhisperStatus, string> = {
  sending: 'Sending…',
  sent: 'Sent',
  delivered: 'Delivered',
  seen: 'Seen',
  failed: 'Not sent',
};

/** One Whisper message (max 280 chars). Outgoing bubbles carry a delivery status in text, not just colour. */
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
  return (
    <div className={cn('flex', out ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-4 py-2.5',
          out
            ? 'rounded-br-sm bg-accent text-on-accent shadow-clay-sm'
            : 'rounded-bl-sm bg-surface text-text-primary shadow-clay-sm',
        )}
      >
        <p className="text-body break-words whitespace-pre-wrap">
          <span className="sr-only">{out ? 'You said: ' : 'They said: '}</span>
          {body}
        </p>
        <p
          className={cn(
            'mt-1 flex justify-end gap-2 text-metadata',
            out ? 'text-on-accent' : 'text-text-muted',
            status === 'failed' && 'font-bold',
          )}
        >
          <span>{time}</span>
          {out && status && (
            <span>
              {status === 'seen' && <span aria-hidden="true">🤘 </span>}
              {STATUS_LABEL[status]}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
