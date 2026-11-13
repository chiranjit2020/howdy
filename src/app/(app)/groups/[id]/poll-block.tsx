'use client';

import { useState, type FormEvent } from 'react';
import type { HallPollView } from '@/modules/town-halls';
import { LIMITS } from '@/shared/limits';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { cn } from '@/ui/cn';
import { CheckCircleIcon } from '@/ui/icons';
import { Button, Input, Modal } from '@/ui/primitives';

/**
 * Result bars in 5% steps, written out whole so Tailwind sees every class (the CSP forbids inline styles, so a bar
 * cannot be given a computed width).
 */
export const BAR = [
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
 * A poll inside its post (ADR-057): the question, then each option as a button with its share of the votes behind it.
 * Tap an option to vote, another to change, yours again to take it back. Everyone sees the counts; nobody sees who.
 */
export function PollBlock({
  question,
  poll,
  onVote,
  onClose,
  busy,
}: {
  question: string;
  poll: HallPollView;
  onVote: (optionId: string | null) => void;
  onClose: () => void;
  busy: boolean;
}) {
  return (
    <section
      aria-label={`Poll: ${question}`}
      className="flex flex-col gap-2 rounded-card border border-card-edge bg-surface-sunken/50 p-3 shadow-clay"
    >
      <p className="font-semibold break-words text-text-primary">{question}</p>
      <ul className="flex flex-col gap-2">
        {poll.options.map((o) => {
          const share = poll.total ? Math.round((o.votes * 100) / poll.total) : 0;
          const chosen = poll.mine === o.id;
          return (
            <li key={o.id}>
              <button
                type="button"
                aria-pressed={chosen}
                disabled={poll.closed || busy}
                onClick={() => onVote(chosen ? null : o.id)}
                className={cn(
                  'relative flex min-h-11 w-full items-center gap-2 overflow-hidden rounded-md border bg-surface px-3 text-left text-caption disabled:cursor-default',
                  chosen
                    ? 'border-accent'
                    : 'border-border hover:border-border-strong disabled:hover:border-border',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn('absolute inset-y-0 left-0 bg-primary-soft', BAR[Math.round(share / 5)])}
                />
                {chosen && (
                  <CheckCircleIcon aria-hidden="true" className="relative shrink-0 text-text-primary" />
                )}
                <span className="relative min-w-0 flex-1 font-semibold break-words text-text-primary">
                  {o.label}
                </span>
                <span className="relative shrink-0 text-text-secondary tabular-nums">{share}%</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap items-center gap-x-2 text-caption text-text-secondary">
        <span>
          {poll.total === 1 ? '1 vote' : `${poll.total} votes`}
          {poll.closed && ' · Final results'}
        </span>
        {poll.canClose && (
          <Button variant="link" size="sm" onClick={onClose}>
            Close poll
          </Button>
        )}
      </p>
    </section>
  );
}

/** "New poll" (ADR-057): a question and two to four options; any member. The server checks everything again. */
export function NewPoll<T>({ townHallId, onPosted }: { townHallId: string; onPosted: (post: T) => void }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setErrors({});
    setBusy(true);
    const res = await postJson<{ post: T }>(`/api/town-halls/${townHallId}/polls`, { question, options });
    setBusy(false);
    if (res.ok && res.data) {
      onPosted(res.data.post);
      setQuestion('');
      setOptions(['', '']);
      setOpen(false);
    } else if (res.error?.fields) setErrors(res.error.fields);
    else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        New poll
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New poll">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Input
            label="Question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={LIMITS.POLL_QUESTION_MAX}
            placeholder="e.g. Which date for the reunion?"
            error={errors.question}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-caption font-semibold text-text-primary">Options</legend>
            {options.map((o, i) => (
              <Input
                key={i}
                label={`Option ${i + 1}`}
                hideLabel
                placeholder={`Option ${i + 1}`}
                value={o}
                onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                maxLength={LIMITS.POLL_OPTION_MAX}
              />
            ))}
            {errors.options && <FormMessage tone="error">{errors.options}</FormMessage>}
            {options.length < LIMITS.POLL_OPTIONS_MAX && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="self-start"
                onClick={() => setOptions((all) => [...all, ''])}
              >
                Add an option
              </Button>
            )}
          </fieldset>
          <Button
            type="submit"
            loading={busy}
            disabled={!question.trim() || options.filter((o) => o.trim()).length < LIMITS.POLL_OPTIONS_MIN}
          >
            Post poll
          </Button>
        </form>
      </Modal>
    </>
  );
}
