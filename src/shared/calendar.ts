/**
 * Howdy's calendar (Phase 12, ADR-028). There is no per-person time zone, and most people are in India, so "today", "on
 * this day" and "opens on 12 March" are all dates in Asia/Kolkata. Pure and browser-safe.
 */
export const APP_TIME_ZONE = 'Asia/Kolkata';

/** A date as YYYY-MM-DD in Howdy's calendar. */
export function dayOf(at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** YYYY-MM-DD plus whole days or years (calendar arithmetic, no time zone involved). */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addYears(day: string, years: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  // 29 Feb + 1 year → 28 Feb (not 1 Mar).
  const target = new Date(Date.UTC(y + years, m - 1, 1));
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** The "MM-DD" days that count as today's anniversary: 28 Feb also remembers 29 Feb in a year without one. */
export function anniversaryDays(today: string): string[] {
  const md = today.slice(5);
  const year = Number(today.slice(0, 4));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return md === '02-28' && !leap ? ['02-28', '02-29'] : [md];
}
