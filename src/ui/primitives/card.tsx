import type { ComponentProps } from 'react';
import { cn } from '../cn';

/** Flat surface: for dense lists and secondary grouping. */
export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('rounded-lg border border-border bg-surface p-4', className)} {...rest} />;
}

/** Tactile clay surface. `interactive` adds the press micro-interaction (use on clickable cards). */
export function ClayCard({
  className,
  interactive,
  ...rest
}: ComponentProps<'div'> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'clay p-5',
        interactive &&
          'cursor-pointer transition duration-150 active:translate-y-0.5 active:shadow-clay-pressed motion-reduce:active:translate-y-0',
        className,
      )}
      {...rest}
    />
  );
}
