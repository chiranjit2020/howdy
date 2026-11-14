'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { LIMITS } from '@/shared/limits';
import {
  ASK_OUTCOMES,
  type AskAudience,
  type AskOutcome,
  type AskVerdict,
} from '@/shared/validation/town-halls';
import { postJson } from '../auth/api';
import { FormMessage } from '../auth/form-parts';
import { cn } from '../cn';
import { BuyFillIcon, BuyIcon, WaitFillIcon, WaitIcon } from '../icons';
import { uploadPhoto } from '../media/upload-photo';
import { Button, Chip, Input, Modal, Radio, Select, Textarea } from '../primitives';
import { FoldedText } from './folded-text';

/**
 * "Buy or wait?" (ADR-065 in groups, ADR-066 for friends and everyone): the question card and the dialog that asks one.
 * The same card shows both kinds; the server decides every button it shows (`canAnswer`, `isAsker`) and checks again.
 */

/** What the card needs: the same core for a group question and a public one. */
export interface AskCore {
  item: string;
  priceRupees: number;
  alternative: string | null;
  note: string | null;
  outcome: AskOutcome | null;
  counts: Record<AskVerdict, number>;
  answers: {
    author: { handle: string; displayName: string };
    verdict: AskVerdict;
    reason: string;
    mine: boolean;
  }[];
  mine: { verdict: AskVerdict; reason: string } | null;
  canAnswer: boolean;
  isAsker: boolean;
}

/** "₹12,499" — Indian digit grouping, whole rupees. */
export const rupees = (n: number) => `₹${new Intl.NumberFormat('en-IN').format(n)}`;

/**
 * The two answers (2026-11-14, the user's asks: "like upvote and downvote", then "not emoji, more prominent"): Phosphor
 * icons, outline until chosen and filled after, as on the tab bar. Buy is sunflower, Wait navy, matching the tally bar.
 */
const VERDICT: Record<
  AskVerdict,
  { label: string; icon: typeof BuyIcon; iconOn: typeof BuyIcon; on: string }
> = {
  buy: { label: 'Buy', icon: BuyIcon, iconOn: BuyFillIcon, on: 'bg-primary text-on-primary' },
  wait: { label: 'Wait', icon: WaitIcon, iconOn: WaitFillIcon, on: 'bg-accent text-on-accent' },
};

/** A small verdict mark for lists (who said what): the filled icon in its colour's ink. */
export function VerdictMark({ verdict, className }: { verdict: AskVerdict; className?: string }) {
  const Icon = VERDICT[verdict].iconOn;
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        'inline size-4 align-[-0.125em]',
        verdict === 'buy' ? 'text-text-primary' : 'text-accent',
        className,
      )}
    />
  );
}
const OUTCOME_LABEL: Record<AskOutcome, string> = {
  bought: 'Bought it',
  waiting: 'Still waiting',
  skipped: 'Skipped it',
};
const OUTCOME_NEWS: Record<AskOutcome, string> = {
  bought: 'Decided: bought it.',
  waiting: 'Decided: waiting for now.',
  skipped: 'Decided: not buying it.',
};

/** Result bars in 5% steps, written out whole so Tailwind sees every class (the CSP forbids inline widths). */
const BAR = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
] as const;

/**
 * Buy and Wait: two big half-width buttons, each with its count, like upvote and downvote. Tapping one makes its icon
 * jump and opens the reason box (a reason is required). The chosen one fills (Buy sunflower, Wait navy). Motion follows
 * the phone's "reduce motion" setting (tokens.css turns every animation off then).
 */
function VerdictButtons({
  counts,
  chosen,
  disabled,
  onPick,
  href,
}: {
  counts: Record<AskVerdict, number>;
  chosen: AskVerdict | null;
  disabled: boolean;
  onPick?: (v: AskVerdict) => void;
  /** Signed out: each button is a link to sign up instead. */
  href?: string;
}) {
  const [burst, setBurst] = useState<{ v: AskVerdict; n: number } | null>(null);
  return (
    <div role="group" aria-label="Buy or wait" className="grid grid-cols-2 gap-3">
      {(['buy', 'wait'] as const).map((v) => {
        const on = chosen === v;
        const Icon = on ? VERDICT[v].iconOn : VERDICT[v].icon;
        const inner = (
          <>
            <span
              key={burst?.v === v ? burst.n : 0}
              aria-hidden="true"
              className={cn('inline-flex', burst?.v === v && 'animate-ask-pop')}
            >
              <Icon className="size-7" />
            </span>
            <span className="text-title font-semibold">{VERDICT[v].label}</span>
            <span className="overflow-hidden text-body tabular-nums opacity-80">
              <span key={counts[v]} className="inline-block animate-ask-tick">
                {counts[v]}
              </span>
            </span>
          </>
        );
        const look = cn(
          'inline-flex min-h-14 items-center justify-center gap-2.5 rounded-pill px-4 no-underline shadow-clay-sm transition-[background-color,transform] active:scale-95 hover:no-underline',
          on
            ? VERDICT[v].on
            : 'border-2 border-text-primary bg-surface text-text-primary hover:bg-surface-sunken',
        );
        return href ? (
          <Link key={v} href={href} className={look} aria-label={`${VERDICT[v].label} (${counts[v]})`}>
            {inner}
          </Link>
        ) : (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            aria-label={`${VERDICT[v].label} (${counts[v]})`}
            disabled={disabled}
            onClick={() => {
              setBurst((b) => ({ v, n: (b?.n ?? 0) + 1 }));
              onPick?.(v);
            }}
            className={cn(look, 'disabled:cursor-default')}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The question card. `why` is the asker's reason (a group post's words, or a public question's own). For members: Buy /
 * Wait with a reason. The asker adds one update and says what they decided (which closes answers).
 */
export function AskBlock({
  ask,
  why,
  busy,
  onAnswer,
  onNote,
  onDecide,
  answerHint,
  signUpHref,
}: {
  ask: AskCore;
  why: string;
  busy: boolean;
  onAnswer: (answer: { verdict: AskVerdict; reason: string } | null) => Promise<boolean>;
  onNote: (note: string) => Promise<boolean>;
  onDecide: (outcome: AskOutcome) => Promise<boolean>;
  /** Said under the reason box: who will see the answer and the name on it. */
  answerHint?: string;
  /** Signed out: the buttons lead here (sign up, then come back) instead of answering. */
  signUpHref?: string;
}) {
  const total = ask.counts.buy + ask.counts.wait;
  const buyShare = total ? Math.round((ask.counts.buy * 100) / total) : 0;
  const [editing, setEditing] = useState(false);
  const [verdict, setVerdict] = useState<AskVerdict | null>(null);
  const [reason, setReason] = useState('');
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState(false);

  const picking = ask.canAnswer && (!ask.mine || editing);
  // While my answer has its own "You said…" line, it is not repeated in the list.
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
          <span className="block text-metadata font-semibold tracking-wide text-text-secondary uppercase">
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
          {total === 0
            ? 'No answers yet. Be the first.'
            : `${ask.counts.buy} say buy · ${ask.counts.wait} say wait`}
        </p>
      </div>

      {signUpHref && <VerdictButtons counts={ask.counts} chosen={null} disabled={false} href={signUpHref} />}

      {ask.canAnswer && ask.mine && !editing && (
        <div className="flex flex-col gap-2">
          <VerdictButtons
            counts={ask.counts}
            chosen={ask.mine.verdict}
            disabled={busy}
            onPick={(v) => {
              setVerdict(v);
              setReason(v === ask.mine!.verdict ? ask.mine!.reason : '');
              setEditing(true);
            }}
          />
          <p className="flex flex-wrap items-baseline gap-x-2 text-caption text-text-secondary">
            <span className="min-w-0 break-words">
              You said{' '}
              <span className="font-semibold text-text-primary">{VERDICT[ask.mine.verdict].label}</span>: “
              {ask.mine.reason}”
            </span>
            <Button variant="link" size="sm" disabled={busy} onClick={() => void onAnswer(null)}>
              Take it back
            </Button>
          </p>
        </div>
      )}

      {picking && (
        <form onSubmit={send} noValidate className="flex flex-col gap-2">
          <VerdictButtons counts={ask.counts} chosen={verdict} disabled={busy} onPick={setVerdict} />
          {verdict && (
            <>
              <Input
                label={verdict === 'buy' ? 'Why buy?' : 'Why wait?'}
                hint={answerHint}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={LIMITS.ASK_REASON_MAX}
                placeholder={
                  verdict === 'buy'
                    ? 'e.g. You use it every day. Worth it.'
                    : 'e.g. The Diwali sale will be cheaper.'
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
              <VerdictMark verdict={a.verdict} />{' '}
              <span className="font-semibold text-text-primary">{a.mine ? 'You' : a.author.displayName}</span>
              {' · '}
              <span className="font-semibold text-text-primary">{VERDICT[a.verdict].label}</span>: {a.reason}
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
                hint="Answer what people asked. You get one, so make it count."
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

/** Where a question goes: friends, everyone, or one of my groups (by id). */
export type AskTarget = AskAudience | { groupId: string };
export type AskPosted<G, P> = { kind: 'group'; groupId: string; post: G } | { kind: 'public'; ask: P };

const AUDIENCE_TEXT: Record<AskAudience, { label: string; hint: string }> = {
  friends: { label: 'My friends', hint: 'Your friends see it and get a notification.' },
  everyone: {
    label: 'Everyone on Howdy',
    hint: 'Anyone on Howdy can answer, and you get a link to share on WhatsApp. Your friends get a notification.',
  },
};

/**
 * The "Buy or wait?" dialog: what, the price, why, what else you could do, and who to ask (my friends, everyone on
 * Howdy, or one of my groups), with a photo if they like. Three a day, wherever you ask.
 */
export function NewAsk<G, P>({
  groups,
  initialTarget = 'friends',
  onPosted,
  trigger = 'Buy or wait?',
  triggerVariant = 'secondary',
}: {
  /** My groups, to ask one of them instead. */
  groups: { id: string; name: string }[];
  initialTarget?: AskTarget;
  onPosted: (made: AskPosted<G, P>) => void;
  trigger?: string;
  triggerVariant?: 'primary' | 'secondary';
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<AskTarget>(initialTarget);
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

  const groupId = typeof target === 'object' ? target.groupId : null;
  const priceNumber = Number(price.replace(/[,\s₹]/g, ''));
  const mode = groupId ? 'group' : (target as AskAudience);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setUploading(true);
    const res = await uploadPhoto('/api/me/card-photo', file);
    setUploading(false);
    if (res.ok) setPhoto({ id: res.mediaId, name: file.name });
    else setError(res.message);
  }

  function reset() {
    setItem('');
    setPrice('');
    setWhy('');
    setAlternative('');
    setPhoto(null);
    setOpen(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setErrors({});
    setBusy(true);
    const common = { item, price: priceNumber, why, alternative };
    if (groupId) {
      const res = await postJson<{ post: G }>(`/api/town-halls/${groupId}/asks`, {
        ...common,
        ...(photo ? { photoId: photo.id } : {}),
      });
      setBusy(false);
      if (res.ok && res.data) {
        onPosted({ kind: 'group', groupId, post: res.data.post });
        reset();
      } else if (res.error?.fields) setErrors(res.error.fields);
      else setError(res.error?.message ?? 'That did not work. Try again.');
      return;
    }
    const res = await postJson<{ ask: P }>('/api/asks', {
      ...common,
      audience: target,
      ...(photo ? { photoId: photo.id } : {}),
    });
    setBusy(false);
    if (res.ok && res.data) {
      onPosted({ kind: 'public', ask: res.data.ask });
      reset();
    } else if (res.error?.fields) setErrors(res.error.fields);
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <>
      {/* min-w: a one-word label ("Ask") on a 44px-tall phone pill would otherwise be a circle. */}
      <Button size="sm" variant={triggerVariant} className="min-w-20" onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Buy or wait?">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-caption text-text-secondary">
            Thinking of buying something? Ask. People answer Buy or Wait, each with a reason. You decide.
          </p>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-caption font-semibold text-text-primary">
              Who do you want to ask?
            </legend>
            {(['friends', 'everyone'] as const).map((a) => (
              <Radio
                key={a}
                name="ask-audience"
                label={AUDIENCE_TEXT[a].label}
                hint={AUDIENCE_TEXT[a].hint}
                checked={target === a}
                onChange={() => setTarget(a)}
              />
            ))}
            {groups.length > 0 && (
              <Radio
                name="ask-audience"
                label="One of my groups"
                hint="Only its members see it. Every member gets a notification."
                checked={mode === 'group'}
                onChange={() => setTarget({ groupId: groups[0]!.id })}
              />
            )}
            {groupId && groups.length > 1 && (
              <Select
                label="Which group"
                value={groupId}
                onChange={(e) => setTarget({ groupId: e.target.value })}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
          </fieldset>
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
            {mode === 'group' ? 'Ask the group' : mode === 'everyone' ? 'Ask everyone' : 'Ask my friends'}
          </Button>
        </form>
      </Modal>
    </>
  );
}
