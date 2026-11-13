'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { HallAskView } from '@/modules/town-halls';
import { LIMITS } from '@/shared/limits';
import { ASK_OUTCOMES, type AskOutcome, type AskVerdict } from '@/shared/validation/town-halls';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { cn } from '@/ui/cn';
import { FoldedText } from '@/ui/howdy/folded-text';
import { uploadPhoto } from '@/ui/media/upload-photo';
import { Button, Chip, Input, Modal, Textarea } from '@/ui/primitives';
import { BAR } from './poll-block';

/** "₹12,499" — Indian digit grouping, whole rupees. */
export const rupees = (n: number) => `₹${new Intl.NumberFormat('en-IN').format(n)}`;

const VERDICT_LABEL: Record<AskVerdict, string> = { buy: 'Buy', wait: 'Wait' };
const OUTCOME_LABEL: Record<AskOutcome, string> = {
  bought: 'Bought it',
  waiting: 'Still waiting',
  skipped: 'Skipped it',
};
/** How the decided line reads to the group. */
const OUTCOME_NEWS: Record<AskOutcome, string> = {
  bought: 'Decided: bought it.',
  waiting: 'Decided: waiting for now.',
  skipped: 'Decided: not buying it.',
};

/**
 * A "Buy or wait?" inside its post (ADR-065). The post's words say why the asker wants it; this shows the item and
 * price, the alternative, the asker's one update, the tally, every answer with its reason, and — for members — Buy /
 * Wait with a reason (required: a bare vote helps nobody). The asker adds one update and says what they decided.
 */
export function AskBlock({
  ask,
  why,
  busy,
  onAnswer,
  onNote,
  onDecide,
}: {
  ask: HallAskView;
  /** The post's words: why the asker wants it. Shown under the item, so the card reads top to bottom. */
  why: string;
  busy: boolean;
  onAnswer: (answer: { verdict: AskVerdict; reason: string } | null) => Promise<boolean>;
  onNote: (note: string) => Promise<boolean>;
  onDecide: (outcome: AskOutcome) => Promise<boolean>;
}) {
  const total = ask.counts.buy + ask.counts.wait;
  const buyShare = total ? Math.round((ask.counts.buy * 100) / total) : 0;
  const [editing, setEditing] = useState(false);
  const [verdict, setVerdict] = useState<AskVerdict | null>(null);
  const [reason, setReason] = useState('');
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState(false);

  const answerOpen = ask.canAnswer && (!ask.mine || editing);
  // While my answer has its own "You said…" line (with Change), it is not repeated in the list.
  const others = ask.canAnswer ? ask.answers.filter((a) => !a.mine) : ask.answers;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!verdict) return;
    if (await onAnswer({ verdict, reason })) {
      setEditing(false);
      setVerdict(null);
      setReason('');
    }
  }

  return (
    <section
      aria-label={`Buy or wait: ${ask.item}`}
      className="flex flex-col gap-3 rounded-card border border-card-edge bg-surface-sunken/50 p-3 shadow-clay"
    >
      <div className="flex items-baseline gap-3">
        <p className="min-w-0 flex-1 font-semibold break-words text-text-primary">
          <span className="block text-metadata font-semibold text-text-secondary uppercase">
            Buy or wait?
          </span>
          {ask.item}
        </p>
        <p className="shrink-0 text-title font-semibold text-text-primary tabular-nums">
          {rupees(ask.priceRupees)}
        </p>
      </div>
      {why && <FoldedText className="text-body text-text-primary">{why}</FoldedText>}
      {ask.alternative && (
        <p className="text-caption break-words text-text-secondary">
          <span className="font-semibold text-text-primary">Or I could: </span>
          {ask.alternative}
        </p>
      )}
      {ask.note && (
        <p className="text-caption break-words text-text-secondary">
          <span className="font-semibold text-text-primary">Update: </span>
          {ask.note}
        </p>
      )}
      {ask.outcome && <p className="font-semibold text-text-primary">{OUTCOME_NEWS[ask.outcome]}</p>}

      {/* The tally: Buy's share in sunflower, Wait's in navy; grey until anyone answers. */}
      <div className="flex flex-col gap-1">
        <div
          aria-hidden="true"
          className={cn('relative h-2 overflow-hidden rounded-pill', total > 0 ? 'bg-accent' : 'bg-border')}
        >
          {total > 0 && (
            <span className={cn('absolute inset-y-0 left-0 bg-primary', BAR[Math.round(buyShare / 5)])} />
          )}
        </div>
        <p className="text-caption text-text-secondary tabular-nums">
          {total === 0 ? 'No answers yet.' : `${ask.counts.buy} say buy · ${ask.counts.wait} say wait`}
        </p>
      </div>

      {ask.canAnswer && ask.mine && !editing && (
        <p className="flex flex-wrap items-baseline gap-x-2 text-caption text-text-secondary">
          <span className="min-w-0 break-words">
            You said{' '}
            <span className="font-semibold text-text-primary">{VERDICT_LABEL[ask.mine.verdict]}</span>: “
            {ask.mine.reason}”
          </span>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setVerdict(ask.mine!.verdict);
              setReason(ask.mine!.reason);
              setEditing(true);
            }}
          >
            Change
          </Button>
          <Button variant="link" size="sm" disabled={busy} onClick={() => void onAnswer(null)}>
            Take it back
          </Button>
        </p>
      )}

      {answerOpen && (
        <form onSubmit={send} noValidate className="flex flex-col gap-2">
          <div role="group" aria-label="Your answer" className="flex flex-wrap gap-2">
            {(['buy', 'wait'] as const).map((v) => (
              <Chip key={v} selected={verdict === v} disabled={busy} onSelect={() => setVerdict(v)}>
                {VERDICT_LABEL[v]}
              </Chip>
            ))}
          </div>
          {verdict && (
            <>
              <Input
                label={verdict === 'buy' ? 'Why buy?' : 'Why wait?'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={LIMITS.ASK_REASON_MAX}
                placeholder={
                  verdict === 'buy'
                    ? 'e.g. You use it every day. Worth it.'
                    : 'e.g. The sale in Diwali week is better.'
                }
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={busy} disabled={reason.trim().length < 2}>
                  Send answer
                </Button>
                {editing && (
                  <Button type="button" variant="link" size="sm" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </>
          )}
        </form>
      )}

      {others.length > 0 && (
        <ul aria-label="Answers" className="flex flex-col gap-1.5 border-t border-border pt-2">
          {others.map((a) => (
            <li key={a.author.handle} className="text-caption break-words text-text-secondary">
              <span className="font-semibold text-text-primary">{a.mine ? 'You' : a.author.displayName}</span>
              {' · '}
              <span className="font-semibold text-text-primary">{VERDICT_LABEL[a.verdict]}</span>: {a.reason}
            </li>
          ))}
        </ul>
      )}

      {ask.isAsker && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          {noting ? (
            <form
              noValidate
              className="flex flex-col gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await onNote(note)) setNoting(false);
              }}
            >
              <Textarea
                label="Your one update"
                hint="Answer what your group asked. You get one, so make it count."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={LIMITS.TOWNHALL_POST_MAX}
                showCount
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={busy} disabled={!note.trim()}>
                  Post update
                </Button>
                <Button type="button" variant="link" size="sm" onClick={() => setNoting(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : deciding || ask.outcome ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-caption font-semibold text-text-primary">What did you decide?</p>
              <div role="group" aria-label="What you decided" className="flex flex-wrap gap-2">
                {ASK_OUTCOMES.map((o) => (
                  <Chip
                    key={o}
                    selected={ask.outcome === o}
                    disabled={busy}
                    onSelect={async () => {
                      if (await onDecide(o)) setDeciding(false);
                    }}
                  >
                    {OUTCOME_LABEL[o]}
                  </Chip>
                ))}
              </div>
            </div>
          ) : (
            <p className="flex flex-wrap gap-x-3">
              {!ask.note && (
                <Button variant="link" size="sm" onClick={() => setNoting(true)}>
                  Add an update
                </Button>
              )}
              <Button variant="link" size="sm" onClick={() => setDeciding(true)}>
                I’ve decided
              </Button>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * "Buy or wait?" (ADR-065): ask the group about something you want to buy — what it is, the price, why, and what else
 * you could do. It rings every member, so the server allows only a few a day.
 */
export function NewAsk<T>({ townHallId, onPosted }: { townHallId: string; onPosted: (post: T) => void }) {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState('');
  const [price, setPrice] = useState('');
  const [why, setWhy] = useState('');
  const [alternative, setAlternative] = useState('');
  const [photo, setPhoto] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const priceNumber = Number(price.replace(/[,\s₹]/g, ''));

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setUploading(true);
    const res = await uploadPhoto('/api/me/card-photo', file);
    setUploading(false);
    if (res.ok) setPhoto({ id: res.mediaId, name: file.name });
    else setError(res.message);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setErrors({});
    setBusy(true);
    const res = await postJson<{ post: T }>(`/api/town-halls/${townHallId}/asks`, {
      item,
      price: priceNumber,
      why,
      alternative,
      ...(photo ? { photoId: photo.id } : {}),
    });
    setBusy(false);
    if (res.ok && res.data) {
      onPosted(res.data.post);
      setItem('');
      setPrice('');
      setWhy('');
      setAlternative('');
      setPhoto(null);
      setOpen(false);
    } else if (res.error?.fields) setErrors(res.error.fields);
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Buy or wait?
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Buy or wait?">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-caption text-text-secondary">
            Thinking of buying something? Ask your group. They answer Buy or Wait, with a reason. You decide.
          </p>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Input
            label="What do you want to buy?"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            maxLength={LIMITS.ASK_ITEM_MAX}
            placeholder="e.g. Noise-cancelling headphones"
            error={errors.item}
          />
          <Input
            label="Price"
            prefix="₹"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 12499"
            error={errors.price}
          />
          <Textarea
            label="Why do you want it?"
            hint="Say what you do now and what would change. The clearer you are, the better the answers."
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            maxLength={LIMITS.TOWNHALL_POST_MAX}
            showCount
            error={errors.why}
          />
          <Input
            label="Or I could…"
            labelAction={<span className="text-caption text-text-muted">Optional</span>}
            value={alternative}
            onChange={(e) => setAlternative(e.target.value)}
            maxLength={LIMITS.ASK_ALTERNATIVE_MAX}
            placeholder="e.g. Keep using my old earphones"
            error={errors.alternative}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                void pickPhoto(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {photo ? (
              <>
                <span className="min-w-0 text-caption break-all text-text-secondary">
                  Photo: {photo.name}
                </span>
                <Button type="button" variant="link" size="sm" onClick={() => setPhoto(null)}>
                  Remove photo
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="link"
                size="sm"
                loading={uploading}
                onClick={() => fileRef.current?.click()}
              >
                Add a photo
              </Button>
            )}
            {errors.photo && <FormMessage tone="error">{errors.photo}</FormMessage>}
          </div>
          <Button
            type="submit"
            loading={busy}
            disabled={uploading || item.trim().length < 2 || !(priceNumber > 0) || why.trim().length < 3}
          >
            Ask the group
          </Button>
        </form>
      </Modal>
    </>
  );
}
