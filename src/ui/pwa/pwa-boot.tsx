'use client';

import { useEffect } from 'react';
import { DynamicIsland } from '../island/island';
import { ChimesIsland } from './chimes-island';
import {
  captureInstallPrompt,
  installedOnThisDevice,
  isInstalled,
  registerServiceWorker,
  resyncPush,
  tidyNotifications,
} from './pwa';

const SENT = 'howdy.appInstalled.sent';
/** POST /api/me/app-installed, once per device (it is harmless to repeat, but there is no need). */
function rememberInstall() {
  try {
    if (window.localStorage.getItem(SENT)) return;
  } catch {
    /* private mode: just send it */
  }
  void fetch('/api/me/app-installed', { method: 'POST', credentials: 'same-origin' }).then((res) => {
    if (!res.ok) return;
    try {
      window.localStorage.setItem(SENT, '1');
    } catch {
      /* it will be sent again next time */
    }
  });
}

/**
 * On every page: hosts the Dynamic Island (ADR-034); registers the service worker and keeps the browser's install offer for
 * our own button (Home's "Get the Howdy app" bar: the island no longer pops up to ask, because nearly everyone closed it).
 * Signed in: re-sends this device's push subscription (so it follows the current session) and, whenever Howdy is looked at,
 * clears the notifications it left behind and sets the app-icon badge.
 */
export function PwaBoot({
  signedIn,
  unread = 0,
  vapidKey,
}: {
  signedIn: boolean;
  unread?: number;
  /** Web Push's public key; signed in, the island offers to turn Chimes on for this phone. */
  vapidKey?: string | undefined;
}) {
  useEffect(() => captureInstallPrompt(), []);

  useEffect(() => {
    void registerServiceWorker().then(() => (signedIn ? resyncPush() : undefined));
  }, [signedIn]);

  // Opened as the installed app, just installed from this browser, or (Android Chrome) found already installed on this
  // phone: tell the account once per device, so Home's "Get the Howdy app" bar goes away everywhere (iPhone never
  // tells a web page it was added to the Home Screen).
  useEffect(() => {
    if (!signedIn) return;
    if (isInstalled()) rememberInstall();
    else void installedOnThisDevice().then((yes) => yes && rememberInstall());
    window.addEventListener('appinstalled', rememberInstall);
    return () => window.removeEventListener('appinstalled', rememberInstall);
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
      {signedIn && <ChimesIsland vapidKey={vapidKey} />}
    </>
  );
}
