'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../cn';

type NativeProps = Omit<ComponentProps<'input'>, 'type'>;

// Ticked: Sunflower with a violet tick (checkbox-tick) and a deep gold edge, so the box still shows on white.
const BOX =
  'size-5 shrink-0 appearance-none border-[1.5px] border-border-strong bg-surface ' +
  'transition-colors checked:border-focus checked:bg-primary aria-invalid:border-danger disabled:opacity-60';

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
    // One line: the box centred on it. With a hint below: the box beside the first line. 44 px rows for fingers; with a
    // mouse only as tall as the text, so stacked boxes sit close together. The label holds the padding and fills the row,
    // so the whole 44 px row is the tap target, not just the line of text.
    <div
      className={cn(
        'flex min-h-11 gap-3 pointer-fine:min-h-0',
        hint ? 'items-start [&>input]:mt-2 pointer-fine:[&>input]:mt-1.5' : 'items-center',
      )}
    >
      {children}
      <label
        htmlFor={id}
        className={cn(
          'flex flex-col self-stretch py-1.5 text-body text-text-primary pointer-fine:py-1',
          !hint && 'justify-center',
        )}
      >
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
 * the 44px touch target; the visible track inside it is 48x28. It is the app's one deliberately 3D control: the track is
 * a groove (sunflower when on, soft grey when off) and the knob a raised white dome, with the same 3px gap all round in
 * both positions, so it never touches the edge. The knob springs across with a little overshoot and stretches while
 * pressed; none of that with reduced motion.
 */
export function SwitchButton({
  checked,
  onCheckedChange,
  disabled,
  id,
  ...aria
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
  id?: string | undefined;
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
      className="group relative flex h-11 w-14 shrink-0 items-center justify-center disabled:opacity-60"
      {...aria}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative h-7 w-12 rounded-pill shadow-switch-track transition-colors duration-200 motion-reduce:transition-none',
          checked ? 'bg-linear-to-b from-primary-hover to-primary' : 'bg-surface-sunken',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] left-[3px] size-[22px] rounded-pill bg-surface shadow-switch-knob',
            // `translate` (Tailwind 4 moves with the translate property, not transform): a quick glide that
            // overshoots a touch and settles. On: 48 - 3 - 22 - 3 = 20px across; pressed, the knob widens to 26px and
            // moves 4px less, so its right edge keeps its 3px gap.
            'transition-[translate,width] duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none',
            'group-active:w-[26px]',
            checked && 'translate-x-5 group-active:translate-x-4',
          )}
        />
      </span>
    </button>
  );
}
