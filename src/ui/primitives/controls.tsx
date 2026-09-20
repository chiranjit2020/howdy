'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../cn';

type NativeProps = Omit<ComponentProps<'input'>, 'type'>;

const BOX =
  'size-6 shrink-0 appearance-none border-2 border-border-strong bg-surface-sunken shadow-clay-pressed ' +
  'transition-colors checked:border-accent checked:bg-accent disabled:opacity-60';

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

/** Native checkbox (keeps browser semantics), clay-styled. The check mark is a CSS gradient, not an image. */
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
        className={cn(
          BOX,
          'rounded-sm checked:bg-[linear-gradient(135deg,transparent_45%,var(--color-on-accent)_45%,var(--color-on-accent)_55%,transparent_55%)]',
          className,
        )}
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
      {/* The button is the 44px touch target; the visible track inside it is 32px tall. */}
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className="relative flex h-11 w-14 shrink-0 items-center disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className={cn(
            'relative h-8 w-14 rounded-pill border-2 transition-colors duration-200',
            checked ? 'border-accent bg-accent' : 'border-border-strong bg-surface-sunken',
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
    </div>
  );
}
