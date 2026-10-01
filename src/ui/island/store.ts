import type { ReactNode } from 'react';

/**
 * The Dynamic Island's queue. Any feature can put an "activity" in it; the island shows ONE at a time — the highest
 * priority, then the oldest — and the next takes its place when it is dismissed. Lives in the browser only.
 *
 * An activity is a compact face (an icon and a few words, always visible) and, optionally, an expanded face the person
 * opens with a tap. Plain data + React nodes: no server code, nothing persisted here (an activity that should stay
 * dismissed across visits remembers that itself).
 */
export interface IslandActivity {
  /** Stable id: showing the same id again replaces it instead of queueing a second one. */
  id: string;
  /** Higher shows first. Install is 10; something live (a call, a timer) should outrank it. */
  priority: number;
  /** The small picture on the left of the pill. Decorative (the label carries the meaning). */
  icon: ReactNode;
  /** The few words in the pill. Also its accessible name. */
  label: string;
  /** Opened by tapping the pill. Without one, the pill is not expandable. */
  expanded?: (close: () => void) => ReactNode;
  /** Called when the person swipes it away / taps ×. */
  onDismiss?: () => void;
  /** Open by itself after this many ms (once), to draw the eye. */
  autoExpandMs?: number;
}

let queue: IslandActivity[] = [];
let order = new Map<string, number>();
let seq = 0;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export function showActivity(activity: IslandActivity): void {
  if (!order.has(activity.id)) order.set(activity.id, seq++);
  queue = [...queue.filter((a) => a.id !== activity.id), activity];
  changed();
}

export function dismissActivity(id: string): void {
  const had = queue.some((a) => a.id === id);
  queue = queue.filter((a) => a.id !== id);
  order.delete(id);
  if (had) changed();
}

/** The one activity on show right now, or null. Stable between changes (safe for useSyncExternalStore). */
let current: IslandActivity | null = null;
function recompute() {
  current =
    [...queue].sort((a, b) => b.priority - a.priority || order.get(a.id)! - order.get(b.id)!)[0] ?? null;
}
listeners.add(recompute);

export const currentActivity = (): IslandActivity | null => current;

export function onIslandChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Tests only: forget everything. */
export function resetIsland(): void {
  queue = [];
  order = new Map();
  current = null;
}
