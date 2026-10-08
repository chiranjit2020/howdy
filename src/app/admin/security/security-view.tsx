import type { Compare, ConsoleData, ConsoleRange, SecurityEventRow } from '@/modules/admin';
import { AutoRefresh } from './auto-refresh';
import { ActivityChart, SERIES, Sparkline } from './charts';

/**
 * The Mission Console (Control Room home), after the Stitch "Howdy Control Room" design — in the Control Room's own
 * charcoal + ghost-white, nothing above 14px, and only real data: every panel reads a real table, and a panel the
 * design had with no real source (geo-IP traffic, infrastructure Howdy does not run) is replaced, not faked.
 */

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
const clockFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const clock = (iso: string) => clockFmt.format(new Date(iso));
const label = (event: string) => {
  const s = event.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const num = (n: number) => n.toLocaleString('en-IN');

const DOT: Record<string, string> = { ok: 'bg-success', warn: 'bg-warning', fail: 'bg-danger' };
const STATUS_WORD: Record<string, string> = { ok: 'Nominal', warn: 'Degraded', fail: 'Down', skip: 'Off' };
const STATUS_TEXT: Record<string, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  fail: 'text-danger',
  skip: 'text-on-island-muted',
};

/** What an event's dot says: green for a normal sign-in, amber for a failure, coral for an alert, blue otherwise. */
const eventTone = (event: string) =>
  event === 'security_alert'
    ? 'bg-signal-coral'
    : /failed/.test(event)
      ? 'bg-warning'
      : event === 'login_success' || event === 'signup' || event === 'email_verified'
        ? 'bg-success'
        : 'bg-info';

const RULE_LABEL: Record<string, string> = {
  account_login_attack: 'Password guessing on an account',
  second_step_attack: 'Wrong second steps (password likely known)',
  login_failure_spike: 'Site-wide sign-in failure spike',
  takeover_wave: 'Account-takeover wave',
  staff_account_change: 'Security change on a staff account',
  mass_suspensions: 'Mass suspensions by one moderator',
  signup_wave: 'Sign-up wave',
  report_flood: 'Report flood',
};

const RANGES: ConsoleRange[] = ['1h', '6h', '24h', '7d'];
const RANGE_WORDS: Record<ConsoleRange, string> = {
  '1h': 'last hour',
  '6h': 'last 6 hours',
  '24h': 'last 24 hours',
  '7d': 'last 7 days',
};

/** "+8.2%" against the previous period. `upIsBad` flips the colour for things that should stay low. */
function Delta({ c, upIsBad = false }: { c: Compare; upIsBad?: boolean }) {
  if (c.prev === 0) {
    return <span className="text-metadata text-on-island-muted">{c.now > 0 ? 'new' : '—'}</span>;
  }
  const pct = ((c.now - c.prev) / c.prev) * 100;
  const good = upIsBad ? pct <= 0 : pct >= 0;
  return (
    <span
      className={
        'font-mono text-metadata tabular-nums ' +
        (pct === 0 ? 'text-on-island-muted' : good ? 'text-success' : 'text-signal-coral')
      }
    >
      {pct > 0 ? '+' : ''}
      {Math.abs(pct) >= 100 ? pct.toFixed(0) : pct.toFixed(1)}%
    </span>
  );
}

function Panel({
  title,
  aside,
  className = '',
  bodyClass = 'p-4',
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  className?: string;
  bodyClass?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        'flex min-h-0 min-w-0 flex-col rounded-md border border-on-island/10 bg-island-raised ' + className
      }
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-on-island/10 px-4 py-2">
        <h2 className="text-caption font-semibold text-on-island">{title}</h2>
        {aside}
      </header>
      {/* Focusable and named, so a keyboard user can scroll it too (axe: scrollable-region-focusable). */}
      <div
        tabIndex={0}
        role="region"
        aria-label={title}
        className={
          'min-h-0 flex-1 rounded-b-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-on-island xl:overflow-y-auto ' +
          bodyClass
        }
      >
        {children}
      </div>
    </section>
  );
}

function Kpi({
  title,
  value,
  delta,
  foot,
  spark,
  tone = 'stroke-telemetry',
  valueTone = 'text-on-island',
}: {
  title: string;
  value: string;
  delta?: React.ReactNode;
  foot: string;
  spark?: number[];
  tone?: string;
  valueTone?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-on-island/10 bg-island-raised px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-tab font-semibold tracking-wider text-on-island-muted uppercase">
          {title}
        </span>
        {delta}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className={'text-caption font-bold tabular-nums ' + valueTone}>{value}</span>
        {spark && <Sparkline values={spark} tone={tone} />}
      </div>
      <span className="truncate text-metadata text-on-island-muted">{foot}</span>
    </div>
  );
}

const sectionLabel = 'text-tab font-semibold tracking-wider text-on-island-muted uppercase';
const navLink =
  'flex min-h-11 items-center justify-between gap-2 rounded-sm px-3 text-caption no-underline hover:bg-on-island/5 hover:text-on-island';

function OpenBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="rounded-sm bg-danger/20 px-1.5 font-mono text-metadata text-danger">{n}</span>;
}

function Sidebar({ data }: { data: ConsoleData }) {
  return (
    <aside className="hidden min-h-0 flex-col border-r border-on-island/10 xl:flex">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-on-island/10 px-4">
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-sm bg-telemetry/20 font-mono text-metadata font-bold text-telemetry-soft"
        >
          H
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-caption font-bold">Howdy</span>
          <span className={sectionLabel}>Control Room</span>
        </span>
      </div>
      <nav aria-label="Control Room" className="flex flex-col gap-1 p-2">
        <a href="/admin/security" aria-current="page" className={navLink + ' bg-on-island/10 text-on-island'}>
          Mission Console
        </a>
        <a href="/moderation" className={navLink + ' text-on-island-muted'}>
          Moderation queue
          <OpenBadge n={data.queue.open} />
        </a>
      </nav>
      <p className="mt-auto flex items-center gap-2 border-t border-on-island/10 px-4 py-3 text-tab font-semibold tracking-wider uppercase">
        <span
          className={'inline-block size-2 rounded-pill ' + (DOT[data.health.status] ?? 'bg-on-island/40')}
        />
        {data.health.status === 'ok'
          ? 'All systems operational'
          : data.health.status === 'warn'
            ? 'Systems degraded'
            : 'A system is down'}
      </p>
    </aside>
  );
}

function EventsTable({ rows }: { rows: SecurityEventRow[] }) {
  if (rows.length === 0) return <p className="text-caption text-on-island-muted">Nothing recorded yet.</p>;
  return (
    <table className="w-full table-fixed text-left text-metadata">
      <thead className={sectionLabel}>
        <tr>
          <th scope="col" className="w-14 pb-2 font-semibold">
            Time
          </th>
          <th scope="col" className="pb-2 font-semibold">
            Event
          </th>
          <th scope="col" className="w-2/5 pb-2 font-semibold">
            Account
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-on-island/5">
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="py-1.5 font-mono text-on-island-muted tabular-nums">{clock(r.at)}</td>
            <td className="truncate py-1.5 text-caption text-on-island">
              <span
                className={'mr-2 inline-block size-1.5 rounded-pill align-middle ' + eventTone(r.event)}
              />
              {label(r.event)}
            </td>
            <td className="truncate py-1.5 text-on-island-muted">{r.handle ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TimedList({ rows, empty }: { rows: SecurityEventRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-caption text-on-island-muted">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-on-island/5">
      {rows.map((r, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
          <span className="min-w-0 truncate text-caption">
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

export function SecurityView({ data }: { data: ConsoleData }) {
  const k = data.kpis;
  const s = data.series;
  const words = RANGE_WORDS[data.range];
  const okChecks = data.health.checks.filter((c) => c.status === 'ok').length;
  const counted = data.health.checks.filter((c) => c.status !== 'skip').length;
  const anyCritical = data.alerts.some((a) => a.severity === 'critical');

  return (
    <div className="grid min-h-dvh xl:h-dvh xl:grid-cols-[232px_minmax(0,1fr)] xl:overflow-hidden">
      <Sidebar data={data} />

      <div className="flex min-h-0 min-w-0 flex-col pb-16 xl:pb-0">
        {/* Top bar */}
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-on-island/10 px-4 py-2 xl:px-6">
          <p className="text-caption text-on-island-muted">
            Howdy Control Room <span aria-hidden>/</span>{' '}
            <span className="font-semibold text-on-island">Mission Console</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-metadata">
            <span className="rounded-sm border border-on-island/10 px-2 py-1 font-mono text-on-island-muted">
              Checked {clock(data.generatedAt)} IST
            </span>
            <span className="rounded-sm border border-on-island/10 px-2 py-1 text-on-island-muted">
              Role: Admin
            </span>
            <span
              className={
                'flex items-center gap-1.5 rounded-sm px-2 py-1 font-semibold ' +
                (data.health.status === 'ok'
                  ? 'bg-success/10 text-success'
                  : data.health.status === 'warn'
                    ? 'bg-warning/10 text-warning'
                    : 'bg-danger/15 text-danger')
              }
            >
              <span className={'inline-block size-1.5 rounded-pill ' + (DOT[data.health.status] ?? '')} />
              {data.health.status === 'ok'
                ? 'Healthy'
                : data.health.status === 'warn'
                  ? 'Degraded'
                  : 'Failing'}
            </span>
          </div>
        </header>

        <main id="main" className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3 xl:px-6">
          {/* Title row */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <h1 className="flex items-center gap-2 text-caption font-bold">
                <span className={'inline-block size-2 rounded-pill ' + (DOT[data.health.status] ?? '')} />
                Mission Console
              </h1>
              <p className="text-metadata text-on-island-muted">
                Platform overview and security telemetry · {words}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <nav aria-label="Time range" className="flex rounded-sm border border-on-island/10 p-0.5">
                {RANGES.map((r) => (
                  <a
                    key={r}
                    href={`/admin/security?range=${r}`}
                    aria-current={r === data.range ? 'true' : undefined}
                    className={
                      'flex min-h-11 min-w-11 items-center justify-center rounded-sm px-2 font-mono text-metadata no-underline ' +
                      (r === data.range
                        ? 'bg-on-island/10 font-semibold text-on-island'
                        : 'text-on-island-muted hover:text-on-island')
                    }
                  >
                    {r}
                  </a>
                ))}
              </nav>
              <AutoRefresh seconds={60} />
            </div>
          </div>

          {/* KPIs */}
          <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi
              title="Total users"
              value={num(k.totalUsers)}
              delta={<Delta c={k.signUps} />}
              foot={`${num(k.signUps.now)} joined, ${words}`}
              spark={s.map((b) => b.signUps)}
              tone="stroke-signal-green"
            />
            <Kpi
              title="Active"
              value={num(k.activeUsers)}
              foot={
                k.totalUsers
                  ? `${((k.activeUsers / k.totalUsers) * 100).toFixed(1)}% of members`
                  : 'No members yet'
              }
            />
            <Kpi
              title="Sign-ins"
              value={num(k.signIns.now)}
              delta={<Delta c={k.signIns} />}
              foot={`vs ${num(k.signIns.prev)} the period before`}
              spark={s.map((b) => b.signIns)}
            />
            <Kpi
              title="Failed sign-ins"
              value={num(k.loginFails.now)}
              delta={<Delta c={k.loginFails} upIsBad />}
              foot={`${data.flagged.length} account(s) under pressure (24h)`}
              spark={s.map((b) => b.failed)}
              tone="stroke-signal-amber"
              valueTone={k.loginFails.now > 20 ? 'text-warning' : 'text-on-island'}
            />
            <Kpi
              title="Reports open"
              value={num(data.queue.open)}
              foot={`${data.queue.reviewing} in review · ${data.safety.suspendedAccounts} suspended`}
              spark={s.map((b) => b.reports)}
              tone="stroke-signal-coral"
              valueTone={data.queue.open > 0 ? 'text-warning' : 'text-on-island'}
            />
            <Kpi
              title="Security alerts"
              value={num(k.alerts.now)}
              delta={<Delta c={k.alerts} upIsBad />}
              foot={k.alerts.now ? 'Emailed to owner + admins' : 'Rules run every 30 min'}
              valueTone={k.alerts.now ? (anyCritical ? 'text-danger' : 'text-warning') : 'text-success'}
            />
          </div>

          {/* Body: chart + safety + events on the left, the side column on the right. */}
          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_400px] xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel
              title="Activity"
              className="md:col-span-2"
              bodyClass="flex flex-col gap-2 p-4"
              aside={
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-metadata text-on-island-muted">
                  {SERIES.map((x) => (
                    <li key={x.key} className="flex items-center gap-1.5">
                      <span className={'inline-block size-1.5 rounded-pill ' + x.dot} />
                      {x.label}
                    </li>
                  ))}
                </ul>
              }
            >
              <p className="text-metadata text-on-island-muted">
                Sign-ins, sign-ups, failed sign-ins and reports, {words} (IST).
              </p>
              <ActivityChart series={s} long={data.range === '7d'} />
            </Panel>

            {/* Side column: one cell spanning both rows on a full-HD screen. */}
            <div className="flex min-h-0 min-w-0 flex-col gap-3 md:col-span-2 xl:col-span-1 xl:row-span-2">
              <Panel
                title="System health"
                className="shrink-0"
                bodyClass="px-4 py-2"
                aside={
                  <span className="rounded-sm bg-success/10 px-1.5 py-0.5 font-mono text-tab font-semibold text-success">
                    {okChecks}/{counted} OK
                  </span>
                }
              >
                <ul className="flex flex-col">
                  {data.health.checks.length === 0 && (
                    <li className="py-1 text-caption text-on-island-muted">Health report unavailable.</li>
                  )}
                  {data.health.checks.map((c) => (
                    <li key={c.id} className="flex items-baseline gap-3 py-0.5 text-metadata">
                      <span className="shrink-0 text-caption text-on-island">{c.label}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-on-island-muted">
                        {c.detail}
                      </span>
                      <span
                        className={
                          'flex shrink-0 items-center gap-1 font-semibold ' + (STATUS_TEXT[c.status] ?? '')
                        }
                      >
                        <span
                          className={
                            'inline-block size-1.5 rounded-pill ' + (DOT[c.status] ?? 'bg-on-island/40')
                          }
                        />
                        {STATUS_WORD[c.status] ?? c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel
                title="Social pulse"
                className="shrink-0"
                bodyClass="p-3"
                aside={<span className="text-metadata text-on-island-muted">{words}</span>}
              >
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['Post Cards', data.social.postCards],
                      ["Yo's sent", data.social.yos],
                      ['Tracks', data.social.tracks],
                      ['Tributes', data.social.tributes],
                    ] as const
                  ).map(([t, c]) => (
                    <div key={t} className="flex flex-col gap-0.5 rounded-sm bg-on-island/5 px-3 py-1.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={sectionLabel}>{t}</span>
                        <Delta c={c} />
                      </span>
                      <span className="text-caption font-bold tabular-nums">{num(c.now)}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Alerts (7d)" className="min-h-32 flex-1">
                {data.alerts.length === 0 ? (
                  <p className="text-caption text-on-island-muted">
                    No alerts this week. Rules run every 30 minutes; new ones are emailed to the owner and
                    admins.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-on-island/5">
                    {data.alerts.map((a, i) => (
                      <li key={i} className="flex flex-col gap-0.5 py-1.5">
                        <span className="flex items-baseline justify-between gap-3">
                          <span
                            className={
                              'min-w-0 text-caption ' +
                              (a.severity === 'critical' ? 'text-danger' : 'text-warning')
                            }
                          >
                            {RULE_LABEL[a.rule] ?? label(a.rule)}
                          </span>
                          <time className="shrink-0 font-mono text-metadata text-on-island-muted tabular-nums">
                            {when(a.at)}
                          </time>
                        </span>
                        <span className="text-metadata text-on-island-muted">
                          {a.severity.toUpperCase()} · {a.count} in an hour{a.handle && ` · ${a.handle}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Was this really them? (7d)" className="min-h-32 flex-1">
                <TimedList
                  rows={data.sensitive}
                  empty="No two-step removals, passkey removals or resets this week."
                />
              </Panel>
            </div>

            <Panel
              title="Safety overview"
              aside={
                <a
                  href="/moderation"
                  className="inline-flex min-h-11 items-center text-metadata font-semibold text-telemetry-soft underline-offset-2 hover:underline"
                >
                  Open queue →
                </a>
              }
            >
              <p className="text-metadata text-on-island-muted">
                Member reports and the automatic photo check. CSAM hash matching is not live yet.
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {(
                  [
                    ['Open', data.queue.open, data.queue.open ? 'text-warning' : 'text-on-island'],
                    ['In review', data.queue.reviewing, 'text-info'],
                    ['Resolved', data.queue.resolved, 'text-success'],
                    ['Suspended', data.safety.suspendedAccounts, 'text-signal-coral'],
                  ] as const
                ).map(([t, n, tone]) => (
                  <div key={t} className="flex min-w-0 flex-col gap-0.5 rounded-sm bg-on-island/5 px-1 py-2">
                    <span className={sectionLabel + ' truncate'}>{t}</span>
                    <span className={'text-caption font-bold tabular-nums ' + tone}>{num(n)}</span>
                  </div>
                ))}
              </div>
              <h3 className={sectionLabel + ' mt-4 mb-1'}>Waiting longest</h3>
              {data.queue.oldest.length === 0 ? (
                <p className="text-metadata text-on-island-muted">The queue is empty.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.queue.oldest.map((r) => (
                    <li key={r.id} className="flex flex-col gap-0.5 rounded-sm bg-on-island/5 px-3 py-2">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-caption">
                          <span className="mr-1.5 rounded-sm bg-warning/15 px-1 font-mono text-tab font-semibold text-warning uppercase">
                            Open
                          </span>
                          #{r.id.slice(0, 8)}
                        </span>
                        <time className="font-mono text-metadata text-on-island-muted">{when(r.at)}</time>
                      </span>
                      <span className="text-metadata text-on-island-muted">
                        {label(r.reason)} · {label(r.subject)} ·{' '}
                        {r.source === 'photo_check' ? 'photo check' : 'member report'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className={sectionLabel + ' mt-4 mb-1'}>Under sign-in pressure (24h)</h3>
              {data.flagged.length === 0 ? (
                <p className="text-metadata text-on-island-muted">
                  No account hit 5+ failed sign-ins or repeated 2-step failures.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-on-island/5">
                  {data.flagged.map((f) => (
                    <li key={f.handle} className="flex items-center justify-between gap-3 py-1">
                      <span className="min-w-0 truncate text-caption">{f.handle}</span>
                      <span className="shrink-0 font-mono text-metadata text-warning tabular-nums">
                        {f.loginFailed} login{f.secondStepFailed > 0 && ` · ${f.secondStepFailed} 2-step`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Recent security events">
              <EventsTable rows={data.recent} />
            </Panel>
          </div>

          <footer className="flex shrink-0 flex-wrap justify-between gap-x-4 gap-y-1 text-tab tracking-wider text-on-island-muted uppercase">
            <span className="flex items-center gap-1.5">
              <span className={'inline-block size-1.5 rounded-pill ' + (DOT[data.health.status] ?? '')} />
              Read-only · the audit trail holds no IPs, tokens or message content
            </span>
            <span>Howdy Control Room</span>
          </footer>
        </main>
      </div>

      {/* Phone and tablet: the sidebar becomes a bottom bar with the same two working links. */}
      <nav
        aria-label="Control Room (bottom)"
        className="fixed inset-x-0 bottom-0 grid grid-cols-2 border-t border-on-island/10 bg-island xl:hidden"
      >
        <a
          href="/admin/security"
          aria-current="page"
          className="flex min-h-14 items-center justify-center text-caption font-semibold text-on-island no-underline"
        >
          Mission Console
        </a>
        <a
          href="/moderation"
          className="flex min-h-14 items-center justify-center gap-1.5 text-caption text-on-island-muted no-underline"
        >
          Moderation
          <OpenBadge n={data.queue.open} />
        </a>
      </nav>
    </div>
  );
}
