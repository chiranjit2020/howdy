'use client';

import { useState, type FormEvent } from 'react';
import { LIMITS } from '@/shared/limits';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, Input, Modal, Textarea } from '@/ui/primitives';

/** Today in Howdy's calendar (Asia/Kolkata), as the date box wants it: "2026-11-01". */
const todayInIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/**
 * "New event" (ADR-056): any member posts one to the group — what, when (Howdy's calendar), where, and any details. It
 * lands at the top of the feed like a post; the server checks everything again.
 */
export function NewEvent<T>({ townHallId, onPosted }: { townHallId: string; onPosted: (post: T) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  function reset() {
    setTitle('');
    setDate('');
    setTime('');
    setPlace('');
    setDetails('');
    setErrors({});
    setError(undefined);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    const missing: Record<string, string> = {};
    if (!date) missing.date = 'Pick a date.';
    if (!time) missing.time = 'Pick a time.';
    setErrors(missing);
    if (Object.keys(missing).length > 0) return;
    setBusy(true);
    const res = await postJson<{ post: T }>(`/api/town-halls/${townHallId}/events`, {
      title: title.trim(),
      // The times people type are Howdy's (India) times, wherever their browser thinks it is.
      startsAt: `${date}T${time}:00+05:30`,
      place: place.trim(),
      details: details.trim(),
    });
    setBusy(false);
    if (res.ok && res.data) {
      onPosted(res.data.post);
      reset();
      setOpen(false);
    } else {
      const f = res.error?.fields ?? {};
      setErrors({ ...(f.startsAt ? { time: f.startsAt } : {}), ...f });
      if (!res.error?.fields) setError(res.error?.message ?? 'That did not work. Try again.');
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        New event
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New event">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Input
            label="What’s happening?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={LIMITS.EVENT_TITLE_MAX}
            placeholder="e.g. Reunion dinner"
            error={errors.title}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Date"
              type="date"
              min={todayInIndia()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              error={errors.date}
            />
            <Input
              label="Time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              error={errors.time}
              hint="India time"
            />
          </div>
          <Input
            label="Where (optional)"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            maxLength={LIMITS.EVENT_PLACE_MAX}
            placeholder="e.g. College canteen"
            error={errors.place}
          />
          <Textarea
            label="Details (optional)"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={LIMITS.TOWNHALL_POST_MAX}
            showCount
            rows={2}
            error={errors.details}
          />
          <Button type="submit" loading={busy} disabled={!title.trim()}>
            Post event
          </Button>
        </form>
      </Modal>
    </>
  );
}
