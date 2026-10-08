import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Control Room', template: '%s · Control Room' },
  robots: { index: false, follow: false },
};

/**
 * The admin surface (Control Room) is deliberately NOT the playful app shell: a dark, high-contrast, utilitarian frame,
 * no Ranch/Fence vocabulary. It lives outside the (app) group so it never carries the member navigation.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={CHARCOAL} className="min-h-dvh bg-island text-on-island">
      {children}
    </div>
  );
}

/** Dark charcoal with ghost-white text, scoped to the Control Room by re-pointing the island tokens. */
const CHARCOAL = {
  '--color-island': '#1b1c1f',
  '--color-island-raised': '#25272b',
  '--color-on-island': '#f8f8ff',
  '--color-on-island-muted': '#b3b5bd',
} as CSSProperties;
