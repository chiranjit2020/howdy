/*
 * Howdy's service worker (ADR-022, ADR-060). Three jobs only: show a notification that arrives while Howdy is closed, open
 * the right page when it is tapped, and show the offline page when a page cannot be reached at all.
 *
 * The only thing it keeps is that offline page (plain HTML, its stylesheet and two brand images: nothing personal). It
 * never stores a response from the site, and it only steps in for page loads that fail with no connection; every other
 * request (and every page that does answer, even with an error) goes to the network untouched. So it still cannot serve a
 * stale or someone else's page.
 */
const OFFLINE_CACHE = 'howdy-offline-v2';
const OFFLINE_PAGE = '/offline.html';
const OFFLINE_FILES = [
  OFFLINE_PAGE,
  '/offline.css',
  '/brand/howdy-wordmark.png',
  '/icons/howdy-bubble-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(OFFLINE_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      // Navigation preload: the browser starts loading the page while this worker wakes up, so having a worker that
      // watches page loads costs no time.
      .then(() => self.registration.navigationPreload && self.registration.navigationPreload.enable())
      .then(() => self.clients.claim()),
  );
});

/** The offline page's own files, from the cache when there is no connection (so it can draw itself). */
function isOfflineFile(url) {
  return url.origin === self.location.origin && OFFLINE_FILES.includes(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    // fetch() rejects only when there is no answer at all (offline, DNS, connection refused); a 404 or 500 resolves and
    // is shown as the site sent it.
    event.respondWith(
      Promise.resolve(event.preloadResponse)
        .then((preloaded) => preloaded || fetch(request))
        .catch(() => caches.match(OFFLINE_PAGE).then((page) => page || Response.error())),
    );
    return;
  }
  if (isOfflineFile(new URL(request.url))) {
    event.respondWith(fetch(request).catch(() => caches.match(request).then((r) => r || Response.error())));
  }
});

/** Only ever a path on this site: a push can never send someone to another site. */
function safePath(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')
    ? url
    : '/notifications';
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
        icon: '/icons/howdy-bubble-192.png',
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
