import { z } from 'zod';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/**
 * The push services browsers actually use. The server sends a request to whatever endpoint a browser hands it, so without this
 * list anyone could make Howdy's server call an address of their choosing (SSRF). Anything else is refused.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge on Android, Samsung Internet, most Chromium browsers
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge on Windows
  /^web\.push\.apple\.com$/, // Safari / home-screen apps on iPhone
];

export const pushEndpointSchema = z
  .string()
  .max(1024)
  .refine((raw) => {
    try {
      const url = new URL(raw);
      return (
        url.protocol === 'https:' &&
        url.port === '' &&
        !url.username &&
        !url.password &&
        PUSH_HOSTS.some((h) => h.test(url.hostname))
      );
    } catch {
      return false;
    }
  }, 'That is not a push service this site can use.');

const b64url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+=*$/);

/** POST /api/push — exactly what `PushSubscription.toJSON()` gives (plus nothing we would act on). */
export const pushSubscribeSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({ p256dh: b64url(80, 100), auth: b64url(16, 32) }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

/** DELETE /api/push */
export const pushUnsubscribeSchema = z.object({ endpoint: pushEndpointSchema });

/** What the service worker receives. Text only; `url` is always an in-app path. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** Same tag = replaces the earlier notification instead of stacking (one per thread, one per kind). */
  tag: string;
  /** Unread Chimes, for the app-icon badge where the platform supports numbers. */
  badge: number;
}
