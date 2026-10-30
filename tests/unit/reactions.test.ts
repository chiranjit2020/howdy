import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REACTIONS, reactionOfEmoji } from '@/shared/reactions';
import { REACTION_KINDS } from '@/shared/validation/fence';

const file = (kind: string) => path.join(process.cwd(), 'public', 'emoji', 'fluent', `${kind}.svg`);

describe('reaction catalog (ADR-049)', () => {
  it.each(REACTION_KINDS)('%s has a label, an emoji and its Fluent picture', (kind) => {
    expect(REACTIONS[kind].label).not.toBe('');
    expect(reactionOfEmoji(REACTIONS[kind].emoji)).toBe(kind);
    expect(existsSync(file(kind))).toBe(true);
  });

  it.each(REACTION_KINDS)('%s.svg is shapes only: no scripts, links, styles or embedded content', (kind) => {
    const svg = readFileSync(file(kind), 'utf8');
    expect(svg).toMatch(/^<svg[\s>]/);
    expect(svg).not.toMatch(/<script|<style|<foreignObject|href=|\son[a-z]+=|url\(/i);
  });

  it('the licence ships with the pictures', () => {
    expect(
      readFileSync(path.join(process.cwd(), 'public', 'emoji', 'fluent', 'LICENSE.txt'), 'utf8'),
    ).toContain('MIT License');
  });

  it('an emoji that is not a reaction is not one', () => {
    expect(reactionOfEmoji('🤘')).toBeUndefined();
  });
});
