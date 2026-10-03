'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest, postJson } from '@/ui/auth/api';
import { RelativeTime } from '@/ui/howdy';
import { Badge, Button, ConfirmationDialog } from '@/ui/primitives';

export interface GateRow {
  id: string;
  deviceLabel: string;
  lastSeenAt: string;
  current: boolean;
}

/**
 * Open Gates: where you are signed in, and the ways out. Each other device can be closed on its own; "Sign out" leaves
 * this one; "Sign out everywhere" (rare and drastic) asks first. Plain words on the buttons — "Hit the Trail" read as
 * a riddle on a button.
 */
export function OpenGates({ initial }: { initial: GateRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const [leaving, setLeaving] = useState<'here' | 'all' | undefined>();
  const [confirmAll, setConfirmAll] = useState(false);

  async function close(id: string) {
    setError(undefined);
    const res = await apiRequest('DELETE', `/api/auth/sessions/${id}`);
    if (res.ok) {
      setRows((r) => r.filter((x) => x.id !== id));
      router.refresh();
    } else {
      setError(res.error?.message ?? 'Could not close that gate.');
    }
  }

  async function leave(which: 'here' | 'all') {
    setLeaving(which);
    await postJson(which === 'all' ? '/api/auth/logout-all' : '/api/auth/logout', {});
    router.push('/gate');
    router.refresh();
  }

  return (
    <section aria-labelledby="open-gates" className="clay flex flex-col gap-2 p-4 sm:p-5">
      <div>
        <h2 id="open-gates" className="text-body font-semibold text-text-primary">
          Open Gates
        </h2>
        <p className="text-caption text-text-secondary">
          Where you are signed in · {rows.length} {rows.length === 1 ? 'device' : 'devices'}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-border/60">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-caption text-text-primary">
                {r.deviceLabel} {r.current && <Badge tone="success">This device</Badge>}
              </p>
              <p className="text-metadata text-text-muted">
                Last active <RelativeTime date={r.lastSeenAt} />
              </p>
            </div>
            {!r.current && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => close(r.id)}
                aria-label={`Close gate on ${r.deviceLabel}`}
              >
                Close
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <Button
          size="sm"
          variant="secondary"
          loading={leaving === 'here'}
          disabled={leaving !== undefined}
          onClick={() => leave('here')}
        >
          Sign out
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={leaving !== undefined}
          onClick={() => setConfirmAll(true)}
        >
          Sign out everywhere…
        </Button>
      </div>
      <ConfirmationDialog
        open={confirmAll}
        destructive
        title="Sign out of every device?"
        description="You will be signed out here and on all other devices. You can step back inside any time."
        confirmLabel="Sign out everywhere"
        loading={leaving === 'all'}
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => leave('all')}
      />
    </section>
  );
}
