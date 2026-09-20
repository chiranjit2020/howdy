/**
 * Keyset cursor (Fence, Chimes): "start after the item made at `at` with id `id`". Opaque to clients (base64url of
 * `<epoch-ms>.<uuid>`) and parsed strictly, so a tampered cursor is refused before it can reach a query. It carries no
 * privilege: what a page contains is decided by the policy on every request, never by the cursor.
 *
 * Timestamps are always written by the application with millisecond precision, so a cursor built from a JavaScript Date
 * compares exactly against the stored value (Postgres' own microsecond `now()` would make paging skip rows).
 */
export interface Cursor {
  at: Date;
  id: string;
}

const TEXT = /^(\d{1,15})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.at.getTime()}.${c.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  if (raw.length === 0 || raw.length > 100 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const m = TEXT.exec(Buffer.from(raw, 'base64url').toString('utf8'));
  if (!m) return null;
  const at = new Date(Number(m[1]));
  if (Number.isNaN(at.getTime())) return null;
  return { at, id: m[2]! };
}
