import type { ActivityBucket } from '@/modules/admin';

/** Server-rendered SVG charts: no chart library, no client JS, nothing the CSP has to allow. */

export const SERIES = [
  {
    key: 'signIns',
    label: 'Sign-ins',
    stroke: 'stroke-telemetry',
    fill: 'fill-telemetry/15',
    dot: 'bg-telemetry',
  },
  {
    key: 'signUps',
    label: 'Sign-ups',
    stroke: 'stroke-signal-green',
    fill: 'fill-signal-green/10',
    dot: 'bg-signal-green',
  },
  {
    key: 'failed',
    label: 'Failed sign-ins',
    stroke: 'stroke-signal-amber',
    fill: '',
    dot: 'bg-signal-amber',
  },
  { key: 'reports', label: 'Reports', stroke: 'stroke-signal-coral', fill: '', dot: 'bg-signal-coral' },
] as const;

const fmtTick = (iso: string, long: boolean) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    ...(long ? { day: '2-digit', month: 'short' } : { hour: '2-digit', minute: '2-digit', hour12: false }),
  }).format(new Date(iso));

/** Line + area chart of the activity series. Scales to its box (viewBox + non-scaling strokes). */
export function ActivityChart({ series, long }: { series: ActivityBucket[]; long: boolean }) {
  const W = 1000;
  const H = 260;
  const max = Math.max(1, ...series.flatMap((b) => [b.signIns, b.signUps, b.failed, b.reports]));
  const x = (i: number) => (series.length <= 1 ? 0 : (i / (series.length - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 12) - 2;
  const total = (k: (typeof SERIES)[number]['key']) => series.reduce((n, b) => n + b[k], 0);
  const ticks = [
    0,
    Math.floor(series.length / 4),
    Math.floor(series.length / 2),
    Math.floor((3 * series.length) / 4),
    series.length - 1,
  ];
  return (
    <figure className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative h-48 flex-1 xl:h-auto xl:min-h-40">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          role="img"
          aria-label={
            'Activity: ' +
            SERIES.map((s) => `${total(s.key)} ${s.label.toLowerCase()}`).join(', ') +
            ` (peak ${max} in one interval).`
          }
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={H * f}
              y2={H * f}
              className="stroke-on-island/10"
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {SERIES.map((s) => {
            const pts = series.map((b, i) => `${x(i)},${y(b[s.key])}`).join(' ');
            return (
              <g key={s.key}>
                {s.fill && <polygon points={`0,${H} ${pts} ${W},${H}`} className={s.fill} />}
                <polyline
                  points={pts}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  className={s.stroke}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex justify-between font-mono text-metadata text-on-island-muted" aria-hidden>
        {ticks.map((i) => (
          <span key={i}>{series[i] ? fmtTick(series[i].at, long) : ''}</span>
        ))}
      </div>
    </figure>
  );
}

/** A tiny trend line for a KPI tile. Decorative: the number beside it is the fact. */
export function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  const W = 96;
  const H = 28;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => `${values.length <= 1 ? 0 : (i / (values.length - 1)) * W},${H - (v / max) * (H - 4) - 2}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hidden h-7 w-24 shrink-0 sm:block" aria-hidden>
      <polyline points={pts} fill="none" strokeWidth={1.5} strokeLinejoin="round" className={tone} />
    </svg>
  );
}
