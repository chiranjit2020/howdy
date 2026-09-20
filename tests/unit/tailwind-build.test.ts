import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Compiles the real stylesheet with Tailwind. A text check of tokens.css is not enough: a stray character
 * before `@theme` once made Tailwind ignore every token and emit zero utilities while the text tests stayed green.
 */
let css = '';
beforeAll(async () => {
  const file = 'src/app/globals.css';
  const result = await postcss([tailwind()]).process(readFileSync(file, 'utf8'), { from: file });
  css = result.css;
}, 30_000);

describe('compiled stylesheet', () => {
  it('consumes every @theme block (none left in the output)', () => {
    expect(css).not.toMatch(/@theme/);
  });

  it('emits the token variables', () => {
    for (const v of [
      '--color-background:',
      '--color-accent:',
      '--radius-pill:',
      '--shadow-clay:',
      '--text-body:',
    ]) {
      expect(css, v).toContain(v);
    }
  });

  it('generates utilities for every design token family used by components', () => {
    for (const cls of [
      '.bg-accent',
      '.bg-surface',
      '.text-text-primary',
      '.text-on-accent',
      '.border-border-strong',
      '.text-body',
      '.text-metadata',
      '.rounded-pill',
      '.shadow-clay-sm',
      '.shadow-float',
      '.animate-yo-pop',
      '.font-display',
      '.clay',
    ]) {
      expect(css, cls).toContain(`${cls} {`);
    }
  });

  it('underlines links and colours them with the AA-checked link token (never colour alone)', () => {
    expect(css).toMatch(/\ba\s*\{[^}]*color:\s*var\(--color-link\)[^}]*text-decoration:\s*underline/);
  });

  it('defines the keyframes the animation tokens refer to', () => {
    for (const k of ['yo-pop', 'toast-in', 'shimmer']) expect(css).toContain(`@keyframes ${k}`);
  });

  it('does not ship Tailwind default palette or type scale (tokens only)', () => {
    expect(css).not.toContain('--color-red-500');
    expect(css).not.toContain('--text-xl:');
    expect(css).not.toContain('--radius-3xl');
  });
});
