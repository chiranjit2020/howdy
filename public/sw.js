/*
 * Howdy's service worker (ADR-022). Two jobs only: show a Chime that arrives while Howdy is closed, and open the right page
 * when it is tapped. It caches nothing and never touches requests, so it cannot serve a stale or someone else's page.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/** Only ever a path on this site: a push can never send someone to another site. */
function safePath(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')
    ? url
    : '/chimes';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' ? data.title.slice(0, 80) : 'Howdy';
  const body = typeof data.body === 'string' ? data.body.slice(0, 200) : 'Something new on Howdy.';
  const tag = typeof data.tag === 'string' ? data.tag.slice(0, 120) : 'howdy';
  const badge = Number.isInteger(data.badge) && data.badge > 0 ? data.badge : 0;
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        tag,
        renotify: true,
        icon: '/icons/icon-192.png',
        data: { url: safePath(data.url) },
      }),
      // The number on the app icon, where the platform shows one (Android shows a dot for any notification).
      badge && 'setAppBadge' in self.navigator ? self.navigator.setAppBadge(badge).catch(() => {}) : null,
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      // navigate() only works on a page this worker controls; otherwise open a fresh one.
      return open
        .focus()
        .then((w) => (w || open).navigate(url))
        .catch(() => self.clients.openWindow(url));
    }),
  );
});
