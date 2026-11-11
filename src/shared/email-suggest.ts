/**
 * "Did you mean name@gmail.com?" under the sign-up email box (2026-11-12). A typo in the domain (gmial.com, gmail.con,
 * yahoo.co) means the confirmation email never arrives and the person thinks Howdy is broken. This only SUGGESTS: one
 * tap fixes it, and the address as typed is always allowed.
 */

/** The providers people in India use most. A near-miss of one of these gets a suggestion. */
const POPULAR = [
  'gmail.com',
  'yahoo.com',
  'yahoo.co.in',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'rediffmail.com',
  'icloud.com',
  'protonmail.com',
  'zoho.com',
] as const;

/**
 * Real domains that sit one or two letters away from a popular one (mail.com vs gmail.com, ymail.com, yahoo.in…). These
 * are never "corrected": someone at mail.com must not be told they meant gmail.com.
 */
const REAL = new Set<string>([
  ...POPULAR,
  'mail.com',
  'email.com',
  'gmx.com',
  'gmx.net',
  'ymail.com',
  'rocketmail.com',
  'yahoo.in',
  'yahoo.co.uk',
  'outlook.in',
  'hotmail.co.uk',
  'live.in',
  'msn.com',
  'aol.com',
  'me.com',
  'mac.com',
  'proton.me',
  'pm.me',
  'zohomail.in',
  'zohomail.com',
  'rediff.com',
  'inbox.com',
  'hey.com',
]);

/** Endings that are always a slip for ".com" (not real endings; ".cm" and ".om" are real countries, so they are left). */
const COM_SLIPS = new Set(['con', 'cmo', 'ocm', 'vom', 'xom', 'cpm', 'comm', 'coom', 'c0m']);

/** Letters added, dropped, changed, or two side by side swapped (gmial -> gmail is ONE edit). */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * The address the person probably meant, or null when it looks right (or is too unusual to guess). Expects a
 * well-formed email; anything else gives null.
 */
export function suggestEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (REAL.has(domain)) return null;

  // Closest popular provider: one slip for short names, up to two for longer ones (gnail.con -> gmail.com).
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const p of POPULAR) {
    const dist = editDistance(domain, p);
    if (dist < bestDistance) [best, bestDistance] = [p, dist];
  }
  if (best && bestDistance <= (domain.length < 9 ? 1 : 2)) return `${local}@${best}`;

  // Any other domain with a ".com" slip: company.con -> company.com.
  const dot = domain.lastIndexOf('.');
  if (dot > 0 && COM_SLIPS.has(domain.slice(dot + 1))) return `${local}@${domain.slice(0, dot)}.com`;
  return null;
}
