'use client';

import { useState } from 'react';
import type { FeedbackItem } from '@/modules/feedback';
import { FEEDBACK_KIND_LABEL, type FeedbackStatus } from '@/shared/validation/feedback';
import { apiRequest } from '@/ui/auth/api';

/** Compact IST timestamp (the app's clock is Asia/Kolkata). */
const fmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const STATUS_LABEL: Record<FeedbackStatus, string> = { new: 'New', read: 'Read', done: 'Done' };
const STATUS_TONE: Record<FeedbackStatus, string> = {
  new: 'bg-telemetry/20 text-telemetry-soft',
  read: 'bg-on-island/10 text-on-island-muted',
  done: 'bg-success/15 text-success',
};
const ACTION =
  'inline-flex min-h-11 items-center rounded-sm border border-on-island/15 px-3 text-metadata font-semibold text-on-island hover:bg-on-island/10 disabled:opacity-50 pointer-fine:min-h-8';

/**
 * The feedback inbox, in the Control Room's own charcoal frame: newest first, with who sent it (a link to their
 * profile), what kind, the page it was about, and buttons to mark it read or done. Marking flips at once and saves
 * in the background; it flips back if saving fails.
 */
export function FeedbackInbox({ initial }: { initial: FeedbackItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const fresh = items.filter((i) => i.status === 'new').length;

  async function mark(id: string, status: FeedbackStatus) {
    const before = items;
    setItems((all) => all.map((i) => (i.id === id ? { ...i, status } : i)));
    setError(undefined);
    const res = await apiRequest('PATCH', `/api/admin/feedback/${id}`, { status });
    if (!res.ok) {
      setItems(before);
      setError(res.error?.message ?? 'That did not save. Try again.');
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4 xl:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-on-island/10 pb-3">
        <p className="text-caption text-on-island-muted">
          <a href="/admin/security" className="text-on-island-muted underline-offset-2 hover:underline">
            Howdy Control Room
          </a>{' '}
          <span aria-hidden>/</span> <span className="font-semibold text-on-island">Feedback</span>
        </p>
        <span className="rounded-sm border border-on-island/10 px-2 py-1 tabular-nums text-metadata text-on-island-muted">
          {fresh} new
        </span>
      </header>
      <main id="main" className="flex flex-col gap-3">
        <h1 className="text-caption font-bold">Feedback</h1>
        {error && (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        )}
        {items.length === 0 ? (
          <p className="text-caption text-on-island-muted">No feedback yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((f) => (
              <li
                key={f.id}
                className="flex flex-col gap-2 rounded-md border border-on-island/10 bg-island-raised px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-metadata">
                  <span className={'rounded-sm px-1.5 py-0.5 font-semibold ' + STATUS_TONE[f.status]}>
                    {STATUS_LABEL[f.status]}
                  </span>
                  <span className="font-semibold text-on-island">{FEEDBACK_KIND_LABEL[f.kind]}</span>
                  <span className="text-on-island-muted">
                    from{' '}
                    {f.from ? (
                      <a
                        href={`/profile/${f.from.handle}`}
                        className="text-on-island underline-offset-2 hover:underline"
                      >
                        {f.from.displayName} (@{f.from.handle})
                      </a>
                    ) : (
                      'a deleted account'
                    )}
                  </span>
                  <span className="text-on-island-muted tabular-nums">
                    · {fmt.format(new Date(f.createdAt))} IST
                  </span>
                  {f.page && <span className="text-on-island-muted">· on {f.page}</span>}
                </div>
                <p className="text-caption [overflow-wrap:anywhere] whitespace-pre-wrap text-on-island">
                  {f.body}
                </p>
                <div className="flex flex-wrap gap-2">
                  {f.status !== 'read' && (
                    <button type="button" className={ACTION} onClick={() => void mark(f.id, 'read')}>
                      Mark read
                    </button>
                  )}
                  {f.status !== 'done' && (
                    <button type="button" className={ACTION} onClick={() => void mark(f.id, 'done')}>
                      Mark done
                    </button>
                  )}
                  {f.status !== 'new' && (
                    <button type="button" className={ACTION} onClick={() => void mark(f.id, 'new')}>
                      Mark new
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
