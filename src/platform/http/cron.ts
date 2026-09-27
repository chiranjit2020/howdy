import { timingSafeEqual } from 'node:crypto';

/** Does the request carry "Authorization: Bearer <secret>" (as Vercel Cron sends CRON_SECRET)? Constant-time. */
export function cronAuthorised(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
