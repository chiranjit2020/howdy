import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';
import { PageFrame } from '@/ui/howdy/page-frame';
import { SettingsTabs } from './settings-tabs';

/**
 * The Workshop's shell, in a layout (not the page) so its loading outline appears inside the top bar and sidebar like
 * every other page's. A route group, so /settings/kit (a design gallery with its own navigation demo) stays outside it.
 * Settings is five short pages (Profile, Privacy, Notifications, People, Account) under one heading and a row of tabs,
 * in Home's frame (PageFrame), so its column sits exactly where Home's does.
 */
export default function WorkshopLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame>
      <PageFrame>
        <h1 className="text-heading text-text-primary">Settings</h1>
        <SettingsTabs />
        {children}
        {/* The way to tell us what to fix or add, at the end of every Settings page (ADR-059). */}
        <p className="text-caption text-text-secondary">
          Something missing or not working?{' '}
          <Link href="/feedback?from=/settings" className="font-semibold">
            Send feedback
          </Link>
        </p>
      </PageFrame>
    </AppFrame>
  );
}
