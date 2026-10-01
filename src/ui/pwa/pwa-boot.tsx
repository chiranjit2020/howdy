'use client';

import { useEffect } from 'react';
import { DynamicIsland } from '../island/island';
import { InstallIsland } from './install-island';
import { captureInstallPrompt, registerServiceWorker, resyncPush, tidyNotifications } from './pwa';

/**
 * On every page: hosts the Dynamic Island (ADR-034) and offers to install Howdy in it; registers the service worker and keeps the browser's install offer for our own button.
 * Signed in: re-sends this device's push subscription (so it follows the current session) and, whenever Howdy is looked at,
 * clears the notifications it left behind and sets the app-icon badge.
 */
export function PwaBoot({ signedIn, unread = 0 }: { signedIn: boolean; unread?: number }) {
  useEffect(() => captureInstallPrompt(), []);

  useEffect(() => {
    void registerServiceWorker().then(() => (signedIn ? resyncPush() : undefined));
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const onShow = () => {
      if (document.visibilityState === 'visible') void tidyNotifications(unread);
    };
    onShow();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [signedIn, unread]);

  return (
    <>
      <DynamicIsland />
      <InstallIsland />
    </>
  );
}
