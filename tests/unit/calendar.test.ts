import { describe, expect, it } from 'vitest';
import { addDays, addYears, anniversaryDays, dayOf } from '@/shared/calendar';

describe("Howdy's calendar (Asia/Kolkata)", () => {
  it('a UTC evening is already the next day in India', () => {
    expect(dayOf(new Date('2026-03-11T18:29:00Z'))).toBe('2026-03-11'); // 23:59 IST
    expect(dayOf(new Date('2026-03-11T18:30:00Z'))).toBe('2026-03-12'); // 00:00 IST
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('adds years; 29 Feb lands on 28 Feb in a year without one', () => {
    expect(addYears('2026-09-30', 5)).toBe('2031-09-30');
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28');
    expect(addYears('2028-02-29', 4)).toBe('2032-02-29');
    expect(addYears('2027-03-01', -1)).toBe('2026-03-01');
  });

  it('28 Feb also remembers 29 Feb, but only when this year has no 29 Feb', () => {
    expect(anniversaryDays('2027-02-28')).toEqual(['02-28', '02-29']);
    expect(anniversaryDays('2028-02-28')).toEqual(['02-28']);
    expect(anniversaryDays('2028-02-29')).toEqual(['02-29']);
    expect(anniversaryDays('2026-09-30')).toEqual(['09-30']);
  });
});
