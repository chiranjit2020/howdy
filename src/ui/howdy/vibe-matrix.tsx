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
 * PRODUCT_DISCOVERY.md C11). One line per kind: until {@link PERCENT_AFTER} Marks its count, then a percentage bar. For
 * someone who may give one now, each line IS the button (no second row of picks); otherwise the lines are plain, with
 * the reason (a 30-day wait) underneath. What each kind means lives in the card's "?" (see MARK_MEANING).
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
  /** May the viewer award a Mark right now? When false the lines are plain, not buttons. */
  canGive?: boolean;
  /** Which kind is mid-flight, if any. */
  giving?: MarkKind;
  onGive?: (kind: MarkKind) => void;
  /** Shown under the lines when giving is offered but not possible now, and there is a reason worth stating. */
  disabledHint?: string;
}) {
  const showPercent = total >= PERCENT_AFTER;
  const giveable = Boolean(onGive && canGive);
  const line = (kind: MarkKind) => {
    const n = counts[kind];
    const pct = total > 0 ? Math.round((n / total) * 100) : 0;
    const marks = `${n} ${n === 1 ? 'badge' : 'badges'}`;
    return (
      <>
        <Art name={MARK_ART[kind]} size="free" className="size-6 shrink-0" />
        <span className="w-14 shrink-0 text-caption font-medium text-text-primary">{MARK_LABEL[kind]}</span>
        {showPercent ? (
          <>
            <span
              className="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-sunken"
              role="img"
              aria-label={`${MARK_LABEL[kind]}: ${marks}, ${pct}%`}
            >
              <span className={cn('block h-full rounded-pill bg-accent', barWidth(pct))} />
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-metadata text-text-secondary">
              {pct}%
            </span>
          </>
        ) : (
          <span className="ml-auto shrink-0 tabular-nums text-caption font-semibold text-text-primary">
            {n}
            <span className="sr-only"> {n === 1 ? 'badge' : 'badges'}</span>
          </span>
        )}
      </>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <ul className="-mx-2 flex flex-col">
        {ORDER.map((kind) => (
          <li key={kind}>
            {giveable ? (
              <button
                type="button"
                onClick={() => onGive!(kind)}
                disabled={giving !== undefined}
                aria-label={`Give a ${MARK_LABEL[kind]} badge (${MARK_MEANING[kind].toLowerCase()})`}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-surface-sunken disabled:cursor-wait pointer-fine:min-h-9"
              >
                {line(kind)}
              </button>
            ) : (
              <div className="flex min-h-9 items-center gap-2.5 px-2">{line(kind)}</div>
            )}
          </li>
        ))}
      </ul>
      {showPercent && (
        <p className="text-metadata text-text-secondary">
          From {total} {total === 1 ? 'badge' : 'badges'}.
        </p>
      )}
      {giveable && (
        <p className="text-metadata text-text-secondary">Tap one to give it. One every 30 days.</p>
      )}
      {onGive && !canGive && disabledHint && (
        <p className="text-metadata text-text-secondary">{disabledHint}</p>
      )}
    </div>
  );
}
