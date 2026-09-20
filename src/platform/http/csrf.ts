import { AppError } from '../errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests (in addition to SameSite=Lax cookies).
 * State-changing requests must carry an Origin equal to APP_URL, or — when a browser omits Origin —
 * a Fetch-Metadata header proving same-origin. Anything else is rejected (fail closed).
 * Never make GET/HEAD state-changing; they are not checked here.
 */
export function assertSameOrigin(req: Request, appUrl: string): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return;

  const expected = new URL(appUrl).origin;
  const origin = req.headers.get('origin');
  if (origin !== null) {
    if (origin === expected) return;
    throw new AppError('CSRF_REJECTED');
  }

  const site = req.headers.get('sec-fetch-site');
  if (site === 'same-origin' || site === 'none') return;
  throw new AppError('CSRF_REJECTED');
}
