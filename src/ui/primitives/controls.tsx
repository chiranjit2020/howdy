'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../cn';

type NativeProps = Omit<ComponentProps<'input'>, 'type'>;

const BOX =
  'size-5 mt-0.5 shrink-0 appearance-none border-[1.5px] border-border-strong bg-surface ' +
  'transition-colors checked:border-accent checked:bg-accent aria-invalid:border-danger disabled:opacity-60';

function ChoiceRow({
  label,
  hint,
  children,
  id,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="flex min-h-11 items-start gap-3 py-1.5">
      {children}
      <label htmlFor={id} className="flex flex-col text-body text-text-primary">
        {label}
        {hint && <span className="text-metadata text-text-muted">{hint}</span>}
      </label>
    </div>
  );
}

/** Native checkbox (keeps browser semantics). The tick is the `checkbox-tick` utility (an SVG in tokens.css). */
export function Checkbox({
  label,
  hint,
  className,
  id,
  ...rest
}: NativeProps & { label: ReactNode; hint?: ReactNode }) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <ChoiceRow label={label} hint={hint} id={inputId}>
      <input
        id={inputId}
        type="checkbox"
        className={cn(BOX, 'checkbox-tick rounded-sm', className)}
        {...rest}
      />
    </ChoiceRow>
  );
}

export function Radio({
  label,
  hint,
  className,
  id,
  ...rest
}: NativeProps & { label: ReactNode; hint?: ReactNode }) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <ChoiceRow label={label} hint={hint} id={inputId}>
      <input
        id={inputId}
        type="radio"
        className={cn(BOX, 'rounded-pill checked:shadow-[inset_0_0_0_5px_var(--color-surface)]', className)}
        {...rest}
      />
    </ChoiceRow>
  );
}

export interface SwitchProps {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
  id?: string;
}

/** role="switch" button: Space/Enter toggle, state exposed via aria-checked. */
export function Switch({ label, hint, checked, onCheckedChange, disabled, id }: SwitchProps) {
  const auto = useId();
  const switchId = id ?? auto;
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1.5">
      <label htmlFor={switchId} className="flex flex-col text-body text-text-primary">
        {label}
        {hint && <span className="text-metadata text-text-muted">{hint}</span>}
      </label>
      <SwitchButton id={switchId} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

/**
 * The switch on its own, for when something else names it (a card's heading, through `aria-labelledby`). The button is
 * the 44px touch target; the visible track inside it is 32px tall.
 */
export function SwitchButton({
  checked,
  onCheckedChange,
  disabled,
  id,
  tone = 'accent',
  ...aria
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
  id?: string | undefined;
  /** The "on" colour: violet (settings), or sunflower for a status you show others (Free to talk). Off is always grey. */
  tone?: 'accent' | 'highlight';
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-label'?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="relative flex h-11 w-14 shrink-0 items-center disabled:opacity-60"
      {...aria}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative h-8 w-14 rounded-pill border-2 transition-colors duration-200',
          !checked
            ? 'border-border-strong bg-surface-sunken'
            : tone === 'highlight'
              ? // A faint violet edge: sunflower alone is pale against a white panel.
                'border-on-highlight/25 bg-highlight'
              : 'border-accent bg-accent',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-6 rounded-pill bg-surface shadow-clay-sm transition-transform duration-200 ease-spring',
            checked && 'translate-x-6',
          )}
        />
      </span>
    </button>
  );
}
