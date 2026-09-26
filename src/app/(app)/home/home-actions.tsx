'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest, postJson } from '@/ui/auth/api';
import { RelativeTime } from '@/ui/howdy';
import { ChevronDownIcon } from '@/ui/icons';
import { Badge, Button, ConfirmationDialog, Tooltip } from '@/ui/primitives';

export interface GateRow {
  id: string;
  deviceLabel: string;
  lastSeenAt: string;
  current: boolean;
}

function useLeave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function leave(path: '/api/auth/logout' | '/api/auth/logout-all') {
    setBusy(true);
    await postJson(path, {});
    router.push('/gate');
    router.refresh();
  }
  return { busy, leave };
}

/** Hit the Trail: sign out on this device. Sized to sit in one row with the other small actions. */
export function HitTheTrail({ className }: { className?: string }) {
  const { busy, leave } = useLeave();
  return (
    <Button
      size="sm"
      variant="secondary"
      compact
      loading={busy}
      onClick={() => leave('/api/auth/logout')}
      className={className}
    >
      Hit the Trail
    </Button>
  );
}

/**
 * "Everywhere" is rare and drastic, so it is a quiet text link (with a hint saying what it does) rather than a button
 * competing with the everyday ones. It still asks first.
 */
export function HitTheTrailEverywhere() {
  const { busy, leave } = useLeave();
  const [confirmAll, setConfirmAll] = useState(false);
  return (
    <>
      <Tooltip content="Signs you out here and on every other phone or computer.">
        <button
          type="button"
          onClick={() => setConfirmAll(true)}
          className="inline-flex min-h-11 items-center text-metadata text-text-muted underline decoration-dotted underline-offset-4 hover:text-text-secondary pointer-fine:min-h-6"
        >
          Hit the Trail everywhere
        </button>
      </Tooltip>
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

  // A quiet, folded line: only worth attention when some OTHER device is signed in, so it opens by itself then.
  const others = rows.filter((r) => !r.current).length;
  return (
    <section aria-labelledby="open-gates" className="px-1">
      <details open={others > 0} className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-caption text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden">
          <span id="open-gates" className="font-semibold">
            Open Gates
          </span>
          <span className="text-text-muted">
            · signed in on {rows.length} {rows.length === 1 ? 'device' : 'devices'}
          </span>
          <ChevronDownIcon className="ml-auto transition-transform group-open:rotate-180" />
        </summary>
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
      </details>
    </section>
  );
}
