import type { ReactNode } from 'react';
import { AppFrame } from '@/app/_lib/app-shell';
import { SettingsTabs } from './settings-tabs';

/**
 * The Workshop's shell, in a layout (not the page) so its loading outline appears inside the top bar and sidebar like
 * every other page's. A route group, so /settings/kit (a design gallery with its own navigation demo) stays outside it.
 * Settings is five short pages (Profile, Privacy, Notifications, People, Account) under one heading and a row of tabs,
 * in Home's 672 px column.
 */
export default function WorkshopLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame>
      <main id="main" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4 py-4">
        <h1 className="text-heading text-text-primary">Settings</h1>
        <SettingsTabs />
        {children}
      </main>
    </AppFrame>
  );
}
