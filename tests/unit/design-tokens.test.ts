import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/styles/tokens.css', 'utf8');

type Pair = { light: string; dark: string };
const tokens = new Map<string, Pair>();
for (const m of css.matchAll(
  /--color-([a-z-]+):\s*(?:light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)|(#[0-9a-f]{6}));/gi,
)) {
  const [, name, light, dark, single] = m;
  tokens.set(name!, single ? { light: single, dark: single } : { light: light!, dark: dark! });
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const get = (name: string, scheme: 'light' | 'dark') => {
  const t = tokens.get(name);
  if (!t) throw new Error(`token --color-${name} not found`);
  return t[scheme];
};

const SCHEMES = ['light', 'dark'] as const;

describe('semantic colour tokens', () => {
  it('parsed a meaningful set of tokens', () => {
    expect(tokens.size).toBeGreaterThan(25);
  });

  it('every Dusk value differs from Daylight for surface/text tokens (a real second theme)', () => {
    for (const n of ['background', 'surface', 'text-primary', 'text-secondary', 'text-muted', 'border']) {
      expect(get(n, 'light'), n).not.toBe(get(n, 'dark'));
    }
  });
});

describe('WCAG AA contrast (both themes)', () => {
  // [foreground, background, minimum ratio, why]
  const textOnSurfaces: [string, number][] = [
    ['text-primary', 4.5],
    ['text-secondary', 4.5],
    ['text-muted', 4.5],
    ['link', 4.5],
    ['danger', 4.5],
    ['success-text', 4.5],
  ];
  const surfaces = ['background', 'surface', 'surface-raised', 'parchment', 'tribute'];

  for (const scheme of SCHEMES) {
    describe(scheme, () => {
      for (const [fg, min] of textOnSurfaces) {
        for (const bg of surfaces) {
          it(`${fg} on ${bg} ≥ ${min}`, () => {
            expect(contrast(get(fg, scheme), get(bg, scheme))).toBeGreaterThanOrEqual(min);
          });
        }
      }

      it('text on filled colour tokens', () => {
        for (const [fg, bg] of [
          ['on-accent', 'accent'],
          ['on-accent', 'accent-hover'],
          ['on-success', 'success'],
          ['on-warning', 'warning'],
          ['on-danger', 'danger'],
          ['on-info', 'info'],
          ['on-mystery', 'mystery'],
          ['text-primary', 'accent-soft'],
          ['text-primary', 'danger-soft'],
          ['text-primary', 'surface-sunken'],
          ['text-secondary', 'surface-sunken'],
        ] as const) {
          expect(contrast(get(fg, scheme), get(bg, scheme)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it('focus ring and control borders meet 3:1 (non-text contrast)', () => {
        for (const bg of ['background', 'surface', 'surface-raised', 'surface-sunken']) {
          expect(contrast(get('focus', scheme), get(bg, scheme)), `focus on ${bg}`).toBeGreaterThanOrEqual(3);
          expect(
            contrast(get('border-strong', scheme), get(bg, scheme)),
            `border-strong on ${bg}`,
          ).toBeGreaterThanOrEqual(3);
        }
      });
    });
  }
});

describe('design-system discipline', () => {
  it('provides a reduced-motion override', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('defines typography tokens for every role in the brief', () => {
    for (const role of ['display', 'heading', 'title', 'body', 'caption', 'metadata', 'code']) {
      expect(css, role).toMatch(new RegExp(`--text-${role}:`));
    }
  });

  it('components never hard-code colours or arbitrary font sizes', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk('src/ui');
    walk('src/app');
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // layout.tsx, manifest.ts and the welcome page's share image are the exceptions: <meta name="theme-color">, the
      // web app manifest and a rendered PNG cannot use CSS variables. Their values are pinned to the tokens by the tests
      // below, so they cannot drift.
      const isPinned = [
        'src/app/layout.tsx',
        'src/app/manifest.ts',
        'src/app/(welcome)/welcome/opengraph-image.tsx',
      ].includes(f.replaceAll('\\', '/'));
      if (!isPinned && /#[0-9a-fA-F]{3,8}\b/.test(src.replace(/&#\d+;/g, '')))
        offenders.push(`${f}: hex colour`);
      if (/\b(?:bg|text|border|ring|fill|stroke|from|to|via)-\[(?:#|rgb|hsl|oklch)/.test(src))
        offenders.push(`${f}: arbitrary colour`);
      if (/\btext-\[\d/.test(src)) offenders.push(`${f}: arbitrary font size`);
    }
    expect(offenders).toEqual([]);
  });

  it('the browser theme-color meta values match the background tokens (Daylight and Dusk)', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    const light = /prefers-color-scheme: light\)',\s*color: '(#[0-9a-f]{6})'/i.exec(layout)?.[1];
    const dark = /prefers-color-scheme: dark\)',\s*color: '(#[0-9a-f]{6})'/i.exec(layout)?.[1];
    expect(light?.toLowerCase()).toBe(get('background', 'light'));
    expect(dark?.toLowerCase()).toBe(get('background', 'dark'));
  });

  it('the welcome share image uses the Daylight palette', () => {
    const image = readFileSync('src/app/(welcome)/welcome/opengraph-image.tsx', 'utf8');
    const pinned = {
      CREAM: 'background',
      INK: 'text-primary',
      SLATE: 'text-secondary',
      PINK: 'accent',
      PINK_SOFT: 'accent-soft',
    };
    for (const [constant, token] of Object.entries(pinned)) {
      const value = new RegExp(`const ${constant} = '(#[0-9a-f]{6})'`, 'i').exec(image)?.[1];
      expect(value?.toLowerCase(), constant).toBe(get(token, 'light'));
    }
  });

  it('the web app manifest colours match the Daylight background token (the installed app opens in Daylight)', () => {
    const manifest = readFileSync('src/app/manifest.ts', 'utf8');
    for (const key of ['background_color', 'theme_color']) {
      const value = new RegExp(`${key}: '(#[0-9a-f]{6})'`, 'i').exec(manifest)?.[1];
      expect(value?.toLowerCase(), key).toBe(get('background', 'light'));
    }
  });
});
