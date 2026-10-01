'use client';

import { useEffect } from 'react';
import { Img } from '../art/img';
import { Button } from '../primitives';
import { dismissActivity, showActivity } from '../island/store';
import { canPromptInstall, isInstalled, onInstallChange, platform, promptInstall } from './pwa';

const ID = 'install';
/** Once dismissed, the island does not ask again on this device for this long. */
export const INSTALL_SNOOZE_MS = 14 * 86_400_000;
const KEY = 'howdy.island.install.dismissedAt';
/** Let the page settle (and Chrome's offer arrive) before the island drops in. */
const SHOW_AFTER_MS = 2500;

/** Which browser's menu to describe. Decided from the user agent: only ever used to pick words, never to gate anything. */
export type InstallBrowser = 'offer' | 'ios' | 'samsung' | 'firefox' | 'in-app' | 'chromium';

export function installBrowser(ua: string, os: ReturnType<typeof platform>, offer: boolean): InstallBrowser {
  if (offer) return 'offer';
  // Instagram, Facebook, LinkedIn, Snapchat… open links in a small browser of their own that cannot install anything.
  if (/FBAN|FBAV|Instagram|Line\/|LinkedInApp|Snapchat|; wv\)/.test(ua)) return 'in-app';
  if (os === 'ios') return 'ios';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Firefox|FxiOS/.test(ua)) return 'firefox';
  return 'chromium';
}

/** The plain steps for each browser that does not offer its own install dialog (ADR-034). */
export const INSTALL_STEPS: Record<Exclude<InstallBrowser, 'offer'>, string[]> = {
  ios: ['Tap the Share button (the square with an arrow).', 'Scroll down and tap “Add to Home Screen”.'],
  samsung: ['Tap the menu (☰) at the bottom.', 'Tap “Add page to”, then “Home screen”.'],
  firefox: ['Tap the menu (⋮).', 'Tap “Install” or “Add to Home screen”.'],
  'in-app': [
    'This app’s built-in browser cannot install Howdy.',
    'Tap ⋮ or ⋯ and choose “Open in browser”, then install from there.',
  ],
  chromium: ['Tap the menu (⋮) at the top right.', 'Tap “Install app” or “Add to Home screen”.'],
};

function snoozed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < INSTALL_SNOOZE_MS;
  } catch {
    return false;
  }
}
function snooze() {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* private mode: it will simply ask again next visit */
  }
}

/**
 * Puts "Install Howdy" in the Dynamic Island on phones (and wherever the browser offers to install), unless Howdy is
 * already installed or the person waved it away in the last 14 days. Many Android browsers never show their own install
 * pop-up, so where there is no offer the island explains the steps for the browser in hand. Renders nothing itself.
 */
export function InstallIsland() {
  useEffect(() => {
    if (isInstalled() || snoozed()) return;
    const os = platform();
    const put = () => {
      const offer = canPromptInstall();
      if (os === 'other' && !offer) return dismissActivity(ID); // a computer that does not offer: say nothing
      const browser = installBrowser(navigator.userAgent, os, offer);
      showActivity({
        id: ID,
        priority: 10,
        icon: <Img src="/icons/icon-192.png" width={32} height={32} alt="" />,
        label: 'Get the Howdy app',
        autoExpandMs: 1200,
        onDismiss: snooze,
        expanded: (close) => (
          <div className="flex flex-col gap-3">
            <p className="text-caption text-on-island-muted">
              Howdy opens from your home screen like any app: full screen, faster, and with Chimes on your
              phone.
            </p>
            {browser === 'offer' ? (
              <Button
                size="sm"
                className="self-start"
                onClick={async () => {
                  if (await promptInstall()) dismissActivity(ID);
                  else close();
                }}
              >
                Install Howdy
              </Button>
            ) : (
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-caption text-on-island">
                {INSTALL_STEPS[browser].map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </div>
        ),
      });
    };
    const timer = window.setTimeout(put, SHOW_AFTER_MS);
    // Chrome's offer can arrive late, or be used up: re-describe the activity when it changes (only once it is showing).
    let shown = false;
    const t2 = window.setTimeout(() => (shown = true), SHOW_AFTER_MS);
    const off = onInstallChange(() => {
      if (isInstalled()) dismissActivity(ID);
      else if (shown) put();
    });
    const onInstalled = () => dismissActivity(ID);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(t2);
      off();
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return null;
}
