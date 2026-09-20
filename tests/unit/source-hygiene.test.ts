import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * "Trojan Source" defence (CVE-2021-42574): bidirectional controls and invisible characters in source code can make
 * code read differently from how it executes, and a formatter can silently turn `\uXXXX` escapes into raw invisible
 * characters (it did, once). No source file may contain them; write them as escapes or build them from numbers.
 */
const RANGES: [number, number][] = [
  [0x00ad, 0x00ad],
  [0x200b, 0x200b],
  [0x200e, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];
// Built from numbers so this very file stays plain ASCII (a formatter cannot turn escapes into raw characters).
const esc = (n: number) => `\\u${n.toString(16).padStart(4, '0')}`;
const INVISIBLE = new RegExp(`[${RANGES.map(([a, b]) => `${esc(a)}-${esc(b)}`).join('')}]`);
const ROOTS = ['src', 'tests', 'db/schema', 'scripts'];
const EXT = /\.(ts|tsx|mjs|css|json|ps1)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

describe('source files contain no invisible or bidirectional characters', () => {
  const files = ROOTS.flatMap((r) => {
    try {
      return walk(r);
    } catch {
      return [];
    }
  });

  it('scans a meaningful number of files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('finds none (including a stray BOM)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      if (INVISIBLE.test(text)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
