import { Art, type ArtName } from '../art/glyph';
import { cn } from '../cn';
import type { MarkKind } from '@/shared/validation/marks';

export const MARK_LABEL: Record<MarkKind, string> = {
  gem: 'Gem',
  pure: 'Pure',
  chill: 'Chill',
  sharp: 'Sharp',
  bold: 'Bold',
};

/** What each Mark says about a person — a trait, never a reaction to one post. */
export const MARK_MEANING: Record<MarkKind, string> = {
  gem: 'Rare, genuinely valuable',
  pure: 'Kind, trustworthy',
  chill: 'Calm, easygoing',
  sharp: 'Smart, insightful',
  bold: 'Confident, courageous',
};

const MARK_ART: Record<MarkKind, ArtName> = {
  gem: 'mark-gem',
  pure: 'mark-pure',
  chill: 'mark-chill',
  sharp: 'mark-sharp',
  bold: 'mark-bold',
};

const ORDER: MarkKind[] = ['gem', 'pure', 'chill', 'sharp', 'bold'];

/** Below this many Marks the matrix shows plain counts: a few Marks make percentages look lopsided, zero looks empty. */
export const PERCENT_AFTER = 20;

/*
 * Bar widths in 5% steps, as whole class names so Tailwind generates them. Not style={{ width }}: the CSP blocks inline
 * style attributes in production. Not an SVG with a viewBox either: its aspect ratio gives it a huge intrinsic width,
 * which stretched the whole Ranch page on phones. The exact percentage is printed beside the bar.
 */
const BAR_WIDTHS = [
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

/** A non-zero share always shows at least a sliver, so "1 Mark" never looks like none. */
function barWidth(pct: number): string {
  const step = Math.round(pct / 5);
  return BAR_WIDTHS[pct > 0 ? Math.max(step, 1) : 0]!;
}

/**
 * A Ranch's Vibe Matrix: an aggregate breakdown of Marks received, never a ranking against anyone else (see
 * PRODUCT_DISCOVERY.md C11). Until {@link PERCENT_AFTER} Marks it shows earned counts, then the percentage bars. Giving
 * one is a row of five picks; the caller decides what happens on a pick.
 */
export function VibeMatrix({
  counts,
  total,
  canGive,
  giving,
  onGive,
  disabledHint,
}: {
  counts: Record<MarkKind, number>;
  total: number;
  /** May the viewer award a Mark right now? When false the picks are shown but disabled. */
  canGive?: boolean;
  /** Which kind is mid-flight, if any. */
  giving?: MarkKind;
  onGive?: (kind: MarkKind) => void;
  /** Shown under the picks when `canGive` is false and there is a reason worth stating. */
  disabledHint?: string;
}) {
  const showPercent = total >= PERCENT_AFTER;
  const toGo = PERCENT_AFTER - total;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {ORDER.map((kind) => {
          const n = counts[kind];
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          const marks = `${n} ${n === 1 ? 'Mark' : 'Marks'}`;
          return (
            <li key={kind} className="flex items-center gap-3">
              <Art name={MARK_ART[kind]} size="free" className="size-8 shrink-0" />
              {showPercent ? (
                <>
                  <span className="w-14 shrink-0 text-caption font-medium text-text-primary">
                    {MARK_LABEL[kind]}
                  </span>
                  <span
                    className="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-sunken"
                    role="img"
                    aria-label={`${MARK_LABEL[kind]}: ${marks}, ${pct}%`}
                  >
                    <span className={cn('block h-full rounded-pill bg-accent', barWidth(pct))} />
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-metadata text-text-secondary">
                    {pct}%
                  </span>
                </>
              ) : (
                <>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-caption font-medium text-text-primary">{MARK_LABEL[kind]}</span>
                    <span className="text-metadata text-text-secondary">{MARK_MEANING[kind]}</span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-body font-semibold text-text-primary">
                    {n}
                    <span className="sr-only"> {n === 1 ? 'Mark' : 'Marks'}</span>
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-text-secondary">
        {total} {total === 1 ? 'Mark' : 'Marks'} total.
        {!showPercent && ` The percentages show up after ${PERCENT_AFTER} — ${toGo} to go.`}
      </p>
      {onGive && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Award a Mark">
            {ORDER.map((kind) => (
              <button
                key={kind}
                type="button"
                title={MARK_MEANING[kind]}
                disabled={!canGive || giving !== undefined}
                onClick={() => onGive(kind)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-border bg-surface pr-3.5 pl-2 text-caption font-semibold text-text-primary shadow-clay-sm transition',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'enabled:active:translate-y-0.5 motion-reduce:enabled:active:translate-y-0',
                )}
              >
                <Art name={MARK_ART[kind]} size="free" className="size-6" />
                {MARK_LABEL[kind]}
              </button>
            ))}
          </div>
          {!canGive && disabledHint && <p className="text-caption text-text-secondary">{disabledHint}</p>}
        </div>
      )}
    </div>
  );
}
