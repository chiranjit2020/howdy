import { Suspense, type ReactNode } from 'react';

/**
 * Draw part of the page from data that is still on its way (a promise started on the server), without holding the rest
 * of the page back: the page is sent at once with `initial` in its place (nothing when there is none), and the real thing
 * streams in when the promise settles. With `value` instead of a promise, it simply draws that. Server components only.
 *
 * The promise must never reject (give it a fallback with .catch): a rejection would take the page's error screen with it.
 */
export function Streamed<T>({
  value,
  initial,
  render,
}: {
  value: T | Promise<T>;
  initial?: T | undefined;
  render: (value: T) => ReactNode;
}) {
  if (!(value instanceof Promise)) return render(value);
  return (
    <Suspense fallback={initial === undefined ? null : render(initial)}>
      <Settled promise={value} render={render} />
    </Suspense>
  );
}

async function Settled<T>({ promise, render }: { promise: Promise<T>; render: (value: T) => ReactNode }) {
  return render(await promise);
}
