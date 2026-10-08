import type { SecurityEventRow, SecurityOverview } from '@/modules/admin';

/** Compact IST timestamp (the app's clock is Asia/Kolkata). Server-rendered, so no client component is needed. */
const fmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const when = (iso: string) => fmt.format(new Date(iso));
const label = (event: string) => {
  const s = event.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const DOT: Record<string, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  fail: 'bg-danger',
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-md border border-on-island/15 bg-island-raised">
      <h2 className="border-b border-on-island/15 px-4 py-2.5 text-caption font-semibold tracking-wide text-on-island-muted uppercase">
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** A big number with its label; `tone` tints only when something is noteworthy (per the control-room brief). */
function Tile({ n, label: l, tone }: { n: number; label: string; tone?: 'danger' | 'warning' }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md border border-on-island/15 bg-island-raised px-4 py-3">
      <span
        className={
          'truncate text-heading font-bold tabular-nums ' +
          (tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-on-island')
        }
      >
        {n.toLocaleString('en-IN')}
      </span>
      <span className="text-metadata tracking-wide text-on-island-muted uppercase">{l}</span>
    </div>
  );
}

function EventTable({ rows, empty }: { rows: SecurityEventRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-caption text-on-island-muted">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-on-island/10">
      {rows.map((r, i) => (
        <li
          key={i}
          className="flex flex-col gap-0.5 py-1.5 text-body sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
        >
          <span className="min-w-0 break-words sm:flex-1 sm:truncate">
            {label(r.event)}
            {r.handle && <span className="text-on-island-muted"> · {r.handle}</span>}
          </span>
          <time className="shrink-0 font-mono text-metadata text-on-island-muted tabular-nums">
            {when(r.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}

const count = (o: SecurityOverview, event: string, win: 'd1' | 'd7' = 'd1') =>
  o.counts.find((c) => c.event === event)?.[win] ?? 0;

export function SecurityView({ data }: { data: SecurityOverview }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-title font-bold tracking-wide">HOWDY · SECURITY CENTER</h1>
          <span className="flex items-center gap-1.5 text-caption text-on-island-muted">
            <span
              className={'inline-block size-2 rounded-pill ' + (DOT[data.health.status] ?? 'bg-on-island/40')}
            />
            {data.health.status === 'ok'
              ? 'System healthy'
              : data.health.status === 'warn'
                ? 'System degraded'
                : 'System failing'}
          </span>
        </div>
        <span className="font-mono text-metadata text-on-island-muted">
          as of {when(data.generatedAt)} IST
        </span>
      </header>

      {/* Last 24 hours at a glance. Colour only where it signals something. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          n={count(data, 'login_failed')}
          label="Login fails 24h"
          tone={count(data, 'login_failed') > 20 ? 'warning' : undefined}
        />
        <Tile
          n={count(data, 'second_step_failed')}
          label="2-step fails 24h"
          tone={count(data, 'second_step_failed') > 0 ? 'warning' : undefined}
        />
        <Tile n={count(data, 'password_reset_completed')} label="Resets 24h" />
        <Tile
          n={count(data, 'two_step_off')}
          label="2-step turned off 24h"
          tone={count(data, 'two_step_off') > 0 ? 'warning' : undefined}
        />
        <Tile n={count(data, 'signup')} label="New accounts 24h" />
        <Tile n={count(data, 'session_revoked')} label="Sessions revoked 24h" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Accounts under sign-in pressure (24h)">
          {data.flagged.length === 0 ? (
            <p className="text-caption text-on-island-muted">
              No account hit {`${5}`}+ login failures or repeated 2-step failures. (Only real accounts are
              logged — unknown emails are not, by design.)
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-on-island/10">
              {data.flagged.map((f) => (
                <li key={f.handle} className="flex items-center justify-between gap-3 py-1.5 text-body">
                  <span className="min-w-0 flex-1 truncate">{f.handle}</span>
                  <span className="shrink-0 font-mono text-metadata tabular-nums text-warning">
                    {f.loginFailed} login{f.secondStepFailed > 0 && ` · ${f.secondStepFailed} 2-step`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Sensitive account changes (7d) — “was this really them?”">
          <EventTable
            rows={data.sensitive}
            empty="No two-step removals, passkey removals or resets this week."
          />
        </Panel>

        <Panel title="System">
          <ul className="flex flex-col divide-y divide-on-island/10">
            {data.health.checks.length === 0 && (
              <li className="py-1.5 text-caption text-on-island-muted">Health report unavailable.</li>
            )}
            {data.health.checks.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-0.5 py-1.5 text-body sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={'inline-block size-2 rounded-pill ' + (DOT[c.status] ?? 'bg-on-island/40')}
                  />
                  {c.label}
                </span>
                <span className="min-w-0 pl-4 text-metadata text-on-island-muted sm:truncate sm:pl-0 sm:text-right">
                  {c.detail}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Safety">
          <div className="grid grid-cols-2 gap-3">
            <Tile
              n={data.safety.openReports}
              label="Open reports"
              tone={data.safety.openReports > 0 ? 'warning' : undefined}
            />
            <Tile n={data.safety.suspendedAccounts} label="Suspended accounts" />
          </div>
          <a
            href="/moderation"
            className="mt-3 inline-flex min-h-11 items-center text-caption font-semibold text-on-island underline underline-offset-2 hover:text-accent-soft"
          >
            Open the moderation queue →
          </a>
        </Panel>
      </div>

      <Panel title="Recent security events">
        <EventTable rows={data.recent} empty="Nothing recorded yet." />
      </Panel>

      <footer className="flex items-center justify-between gap-2 text-metadata text-on-island-muted">
        <span>Read-only. The audit trail holds no IPs, tokens or message content.</span>
        <a
          href="/admin/security"
          className="inline-flex min-h-11 items-center font-semibold text-on-island-muted underline underline-offset-2 hover:text-on-island"
        >
          Refresh
        </a>
      </footer>
    </main>
  );
}
