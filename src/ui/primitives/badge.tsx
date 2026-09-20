import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../cn';
import { CloseIcon } from '../icons';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'mystery';

export const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-text-primary',
  accent: 'bg-accent text-on-accent',
  success: 'bg-success text-on-success',
  warning: 'bg-warning text-on-warning',
  danger: 'bg-danger text-on-danger',
  info: 'bg-info text-on-info',
  mystery: 'bg-mystery text-on-mystery',
};

/** Small, non-interactive status label. */
export function Badge({ tone = 'neutral', className, ...rest }: { tone?: Tone } & ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-metadata font-semibold',
        TONE[tone],
        className,
      )}
      {...rest}
    />
  );
}

export interface ChipProps extends Omit<ComponentProps<'button'>, 'onClick'> {
  children: ReactNode;
  /** When provided the chip is a toggle and exposes aria-pressed. */
  selected?: boolean;
  onSelect?: () => void;
  /** When provided a separate, labelled remove button is rendered. */
  onRemove?: () => void;
  removeLabel?: string;
}

/** Interactive chip: toggle (selected/onSelect) and/or removable. */
export function Chip({
  children,
  selected,
  onSelect,
  onRemove,
  removeLabel = 'Remove',
  className,
  ...rest
}: ChipProps) {
  const toggle = onSelect !== undefined;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border border-border-strong text-caption font-medium',
        selected ? 'border-accent bg-accent-soft' : 'bg-surface',
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={toggle ? Boolean(selected) : undefined}
        onClick={onSelect}
        className={cn(
          'min-h-11 rounded-pill px-3.5 pointer-fine:min-h-9',
          !toggle && 'cursor-default',
          onRemove && 'pr-1',
        )}
        {...rest}
      >
        {children}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="mr-1 inline-flex size-11 items-center justify-center rounded-pill hover:bg-surface-sunken pointer-fine:size-8"
        >
          <CloseIcon />
        </button>
      )}
    </span>
  );
}
