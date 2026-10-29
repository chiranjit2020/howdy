'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { apiRequest, postJson } from '../auth/api';
import { cn } from '../cn';
import { RelativeTime } from '../howdy';
import { Badge, Button, ConfirmationDialog } from '../primitives';

export interface DeviceRow {
  id: string;
  deviceLabel: string;
  lastSeenAt: string;
  current: boolean;
}

/**
 * Where you are signed in, and the ways out: each other device can be closed on its own; "Sign out" leaves this one;
 * "Sign out everywhere" (rare and drastic) asks first. Lives in the avatar menu (wide screens) and in Settings (every
 * screen). Without `initial` it loads the list itself, when it is first shown.
 */
export function Devices({ initial, plain = false }: { initial?: DeviceRow[]; plain?: boolean }) {
  const router = useRouter();
  const headingId = useId();
  const [rows, setRows] = useState<DeviceRow[] | null>(initial ?? null);
  const [error, setError] = useState<string | undefined>();
  const [leaving, setLeaving] = useState<'here' | 'all' | undefined>();
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    if (initial) return;
    let gone = false;
    void apiRequest<{ sessions: DeviceRow[] }>('GET', '/api/auth/sessions').then((res) => {
      if (gone) return;
      if (res.ok && res.data) setRows(res.data.sessions);
      else setError('Could not load your devices.');
    });
    return () => {
      gone = true;
    };
  }, [initial]);

  async function close(id: string) {
    setError(undefined);
    const res = await apiRequest('DELETE', `/api/auth/sessions/${id}`);
    if (res.ok) {
      setRows((r) => r?.filter((x) => x.id !== id) ?? r);
      router.refresh();
    } else {
      setError(res.error?.message ?? 'Could not sign that device out.');
    }
  }

  async function leave(which: 'here' | 'all') {
    setLeaving(which);
    await postJson(which === 'all' ? '/api/auth/logout-all' : '/api/auth/logout', {});
    router.push('/gate');
    router.refresh();
  }

  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-2', !plain && 'clay p-4 sm:p-5')}>
      <div>
        <h2 id={headingId} className="text-body font-semibold text-text-primary">
          Devices
        </h2>
        <p className="text-caption text-text-secondary">
          {rows
            ? `Where you are signed in · ${rows.length} ${rows.length === 1 ? 'device' : 'devices'}`
            : 'Where you are signed in'}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
      {rows === null && !error && <p className="text-caption text-text-muted">Loading…</p>}
      {rows && (
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
                  aria-label={`Sign out on ${r.deviceLabel}`}
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
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
        description="You will be signed out here and on all other devices. You can log in again any time."
        confirmLabel="Sign out everywhere"
        loading={leaving === 'all'}
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => leave('all')}
      />
    </section>
  );
}
