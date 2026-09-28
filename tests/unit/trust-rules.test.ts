import { describe, expect, it } from 'vitest';
import { judge, TRUST_RULES, type Facts } from '@/modules/trust';

const NOW = new Date('2026-09-28T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);

/** Someone who passes every check with nothing to spare. */
const passing = (): Facts => ({
  status: 'active',
  role: 'member',
  emailVerified: true,
  createdAt: daysAgo(TRUST_RULES.accountAgeDays),
  portrait: true,
  pals: TRUST_RULES.minPals,
  markGivers: TRUST_RULES.minMarkGivers,
  giversByKind: { gem: TRUST_RULES.giversPerKind, pure: TRUST_RULES.giversPerKind, chill: 1 },
  lastSeenAt: daysAgo(TRUST_RULES.activeWithinDays),
  upheldReports: 0,
});

const failing = (f: Facts) =>
  judge(f, NOW)
    .filter((c) => !c.met)
    .map((c) => c.key);

describe('the Trusted-tick checklist', () => {
  it('passes when every check is met exactly at its threshold', () => {
    expect(failing(passing())).toEqual([]);
  });

  it.each([
    ['email', { emailVerified: false }],
    ['age', { createdAt: daysAgo(TRUST_RULES.accountAgeDays - 1) }],
    ['portrait', { portrait: false }],
    ['pals', { pals: TRUST_RULES.minPals - 1 }],
    ['markGivers', { markGivers: TRUST_RULES.minMarkGivers - 1 }],
    ['active', { lastSeenAt: daysAgo(TRUST_RULES.activeWithinDays + 1) }],
    ['active', { lastSeenAt: null }],
    ['standing', { upheldReports: 1 }],
    ['standing', { status: 'suspended' }],
  ] as const)('fails only %s when that one thing falls short', (key, patch) => {
    expect(failing({ ...passing(), ...patch })).toEqual([key]);
  });

  it('needs a spread of kinds: many people all giving one kind is not enough', () => {
    const oneKind = { ...passing(), giversByKind: { gem: 10 } };
    expect(failing(oneKind)).toEqual(['markKinds']);
    // A kind only counts once enough different people chose it.
    const thin = { ...passing(), giversByKind: { gem: 5, pure: TRUST_RULES.giversPerKind - 1 } };
    expect(failing(thin)).toEqual(['markKinds']);
  });

  it('reports progress for countable checks, capped at what is needed', () => {
    const checks = judge({ ...passing(), pals: 1, markGivers: 40 }, NOW);
    expect(checks.find((c) => c.key === 'pals')).toMatchObject({
      met: false,
      have: 1,
      need: TRUST_RULES.minPals,
    });
    expect(checks.find((c) => c.key === 'markGivers')).toMatchObject({
      met: true,
      have: TRUST_RULES.minMarkGivers,
    });
  });

  it('is a checklist, not a score: no amount of one signal makes up for another', () => {
    const lopsided = {
      ...passing(),
      pals: 500,
      markGivers: 500,
      giversByKind: { gem: 500, pure: 500 },
      portrait: false,
    };
    expect(failing(lopsided)).toEqual(['portrait']);
  });
});
