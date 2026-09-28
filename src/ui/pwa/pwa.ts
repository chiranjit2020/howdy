/**
 * Browser-side helpers for "Howdy as an app" (ADR-022): the service worker, the install prompt, and push notifications.
 * Every function is safe to call in any browser: where something is not supported it reports that instead of throwing.
 */

/** Chrome's install prompt event (not in the DOM typings). */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/** The browser offered to install Howdy; keep the offer until a button uses it. Called once, from PwaBoot. */
export function captureInstallPrompt(): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault(); // keep it for our own button (Chrome still shows its own menu item)
    deferred = e as InstallPromptEvent;
    changed();
  };
  const onInstalled = () => {
    deferred = null;
    changed();
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

export const canPromptInstall = () => deferred !== null;
export function onInstallChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Show the browser's own install dialog. True when the person said yes. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; // an offer can be used once
  changed();
  await e.prompt();
  return (await e.userChoice).outcome === 'accepted';
}

/** Running as the installed app (home-screen icon), not in a browser tab. */
export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type Platform = 'ios' | 'android' | 'other';
export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

// ─── push ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * unsupported: this browser cannot (or, on iPhone, not until Howdy is on the Home Screen); blocked: the person said no in the
 * browser, which only the browser's settings can undo; off / on: for this device.
 */
export type PushState = 'unsupported' | 'blocked' | 'off' | 'on';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

async function send(method: 'POST' | 'DELETE', body: unknown): Promise<boolean> {
  try {
    const res = await fetch('/api/push', {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Ask the browser (it shows its own permission dialog), then tell Howdy where to reach this device. */
export async function enablePush(vapidKey: string): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'off';
  const reg = (await registerServiceWorker()) && (await navigator.serviceWorker.ready);
  if (!reg) return 'unsupported';
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
  return (await send('POST', sub.toJSON())) ? 'on' : 'off';
}

export async function disablePush(): Promise<PushState> {
  const sub = supported() ? await currentSubscription() : null;
  if (sub) {
    await send('DELETE', { endpoint: sub.endpoint });
    await sub.unsubscribe().catch(() => false);
  }
  return pushState();
}

/**
 * On every app start: if this device already has notifications on, tell Howdy again. That re-binds it to whoever is signed in
 * NOW (after signing out and in again, the old session's binding is dead and only this brings it back).
 */
export async function resyncPush(): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await send('POST', sub.toJSON());
}

/** Opening Howdy clears the notifications it left in the tray, and sets the app-icon number to what is still unread. */
export async function tidyNotifications(unread: number): Promise<void> {
  try {
    const reg = supported() ? await navigator.serviceWorker.getRegistration('/') : undefined;
    (await reg?.getNotifications())?.forEach((n) => n.close());
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unread > 0) await nav.setAppBadge?.(unread);
    else await nav.clearAppBadge?.();
  } catch {
    /* badges are a nicety */
  }
}
