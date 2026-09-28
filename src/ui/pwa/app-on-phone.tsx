'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { FormMessage } from '../auth/form-parts';
import { Button, ClayCard } from '../primitives';
import {
  canPromptInstall,
  disablePush,
  enablePush,
  isInstalled,
  onInstallChange,
  platform,
  promptInstall,
  pushState,
  type Platform,
  type PushState,
} from './pwa';

const noSubscribe = () => () => undefined;

/**
 * "Howdy on your phone": install it (the browser's own dialog where there is one, plain steps where there is not — some
 * Android browsers and every iPhone never offer it), and turn on notifications for this device.
 */
export function AppOnPhone({ vapidKey }: { vapidKey: string | undefined }) {
  const offer = useSyncExternalStore(onInstallChange, canPromptInstall, () => false);
  const installed = useSyncExternalStore(noSubscribe, isInstalled, () => false);
  const os = useSyncExternalStore<Platform | null>(noSubscribe, platform, () => null);
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    void pushState().then(setPush);
  }, []);

  async function install() {
    setError(undefined);
    await promptInstall();
  }

  async function toggle(on: boolean) {
    if (!vapidKey) return;
    setBusy(true);
    setError(undefined);
    const next = on ? await enablePush(vapidKey) : await disablePush();
    setBusy(false);
    setPush(next);
    if (on && next === 'off') setError('Notifications did not turn on. Try again.');
  }

  if (os === null) return null; // decided in the browser only

  return (
    <ClayCard>
      <h2 className="text-title text-text-primary">Howdy on your phone</h2>
      <div className="mt-3 flex flex-col gap-3">
        {!installed &&
          (offer ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-[1_1_12rem] text-caption text-text-secondary">
                Add Howdy to your home screen. It opens like an app.
              </p>
              <Button size="sm" onClick={install}>
                Install Howdy
              </Button>
            </div>
          ) : (
            <p className="text-caption text-text-secondary">
              {os === 'ios'
                ? 'To install: tap Share, then “Add to Home Screen”.'
                : 'To install: open your browser’s menu (⋮) and choose “Install app” or “Add to Home screen”.'}
            </p>
          ))}

        {vapidKey && push !== null && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-[1_1_12rem] text-caption text-text-secondary">
              {push === 'on'
                ? 'Notifications are on for this device. You will hear about Whispers and Chimes even when Howdy is closed.'
                : push === 'blocked'
                  ? 'Notifications are blocked for Howdy. Allow them in your browser’s site settings, then come back.'
                  : push === 'unsupported'
                    ? os === 'ios' && !installed
                      ? 'On iPhone, notifications work once Howdy is on your Home Screen. Install it, then open it from there.'
                      : 'This browser cannot show notifications while Howdy is closed.'
                    : 'Get a notification for Whispers and Chimes, even when Howdy is closed.'}
            </p>
            {(push === 'on' || push === 'off') && (
              <Button
                size="sm"
                variant={push === 'on' ? 'secondary' : 'primary'}
                loading={busy}
                onClick={() => toggle(push !== 'on')}
              >
                {push === 'on' ? 'Turn off' : 'Turn on notifications'}
              </Button>
            )}
          </div>
        )}
        {error && <FormMessage tone="error">{error}</FormMessage>}
      </div>
    </ClayCard>
  );
}
