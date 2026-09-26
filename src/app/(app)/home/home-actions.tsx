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

/** Hit the Trail (log out here) and, in the confirmation dialog, everywhere. */
export function HitTheTrail() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  async function leave(path: '/api/auth/logout' | '/api/auth/logout-all') {
    setBusy(true);
    await postJson(path, {});
    router.push('/gate');
    router.refresh();
  }

  return (
    <>
      {/* Signing out is the least-used action, so it is the smaller row. */}
      <div className="flex flex-wrap gap-x-2 gap-y-1 sm:gap-3">
        <Button size="sm" variant="secondary" loading={busy} onClick={() => leave('/api/auth/logout')}>
          Hit the Trail
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmAll(true)}>
          Hit the Trail everywhere
        </Button>
      </div>
      <ConfirmationDialog
        open={confirmAll}
        destructive
        title="Sign out of every device?"
        description="You will be signed out here and on all other devices. You can step back inside any time."
        confirmLabel="Sign out everywhere"
        loading={busy}
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => leave('/api/auth/logout-all')}
      />
    </>
  );
}

/** Open Gates: where you are signed in. Each other device can be closed individually. */
export function OpenGates({ initial }: { initial: GateRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | undefined>();

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

  return (
    <section aria-labelledby="open-gates" className="flex flex-col gap-3">
      <h2 id="open-gates" className="text-title text-text-primary">
        Open Gates
      </h2>
      {error && (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-lg bg-surface-sunken p-3">
            <div className="min-w-0 flex-1">
              <p className="text-body text-text-primary">
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
    </section>
  );
}
