import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Control Room', template: '%s · Control Room' },
  robots: { index: false, follow: false },
};

/**
 * The admin surface (Control Room) is deliberately NOT the playful app shell: a dark, high-contrast, utilitarian frame,
 * no Ranch/Fence vocabulary. It lives outside the (app) group so it never carries the member navigation.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-island text-on-island">{children}</div>;
}
