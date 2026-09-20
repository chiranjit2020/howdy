import { describe, expect, it } from 'vitest';
import {
  displayNameSchema,
  handleParamSchema,
  normaliseText,
  setSignalSchema,
  signalSchema,
  updateRanchSchema,
} from '@/shared/validation/profile';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;
const u = (code: number) => String.fromCodePoint(code);

describe('displayNameSchema', () => {
  it('normalises: trims, collapses whitespace, applies NFC', () => {
    expect(displayNameSchema.parse('  Chiranjit    Karmakar \n')).toBe('Chiranjit Karmakar');
    // "e" + combining acute (2 code points) becomes the single precomposed "é"
    expect(displayNameSchema.parse('Rene' + u(0x301)).length).toBe(4);
    expect(displayNameSchema.parse(`Cafe${u(0x301)}`)).toBe('Café');
  });

  it('accepts real names: other scripts, apostrophes, emoji, and ZWNJ/ZWJ that Indic scripts and emoji need', () => {
    for (const name of [
      'Priya Sharma',
      "Shaun O'Neil",
      'José',
      '李小龍',
      'সুমন',
      'Ann-Marie',
      `Zainab ${u(0x1f984)}`,
      `क्${u(0x200d)}ष`,
      `می${u(0x200c)}خواهم`,
    ]) {
      expect(ok(displayNameSchema, name), name).toBe(true);
    }
  });

  it.each([
    ['empty', ''],
    ['only whitespace', '   \t  '],
    ['too long (51)', 'a'.repeat(51)],
    ['a link', 'Visit http://evil.example'],
    ['a www link', 'www.evil.example'],
    ['a bare domain', 'free-money.com'],
    ['a control character', 'bad\u0007name'],
    ['NUL', 'a\u0000b'],
  ])('rejects %s', (_n, v) => {
    expect(ok(displayNameSchema, v)).toBe(false);
  });

  it.each([
    ['bidi override (RLO)', 0x202e],
    ['bidi embedding (LRE)', 0x202a],
    ['bidi isolate', 0x2066],
    ['zero-width space', 0x200b],
    ['left-to-right mark', 0x200e],
    ['soft hyphen', 0x00ad],
    ['word joiner', 0x2060],
    ['byte order mark', 0xfeff],
  ])('the look-alike spoofing character never survives: %s', (_n, cp) => {
    // Either the name is rejected outright, or (for characters JavaScript treats as whitespace, like the BOM) it is
    // normalised into an ordinary visible space. What must never happen is the invisible character reaching storage.
    const result = displayNameSchema.safeParse(`Admin${u(cp)}istrator`);
    if (result.success) expect(result.data).not.toContain(u(cp));
    else expect(result.success).toBe(false);
  });

  it('the bidi override, zero-width and soft-hyphen characters are rejected outright (not merely stripped)', () => {
    for (const cp of [0x202e, 0x202a, 0x2066, 0x200b, 0x200e, 0x00ad, 0x2060]) {
      expect(ok(displayNameSchema, `Admin${u(cp)}istrator`), `U+${cp.toString(16)}`).toBe(false);
    }
  });

  it('counts the limit after normalisation, in characters (emoji count once)', () => {
    expect(ok(displayNameSchema, 'a'.repeat(50))).toBe(true);
    expect(ok(displayNameSchema, `${'a'.repeat(49)}${u(0x1f984)}`)).toBe(true);
  });
});

describe('signalSchema', () => {
  it('enforces the 80-character product limit and forbids links and disguising characters', () => {
    expect(ok(signalSchema, 'Writing code. Send chai.')).toBe(true);
    expect(ok(signalSchema, 'x'.repeat(80))).toBe(true);
    expect(ok(signalSchema, 'x'.repeat(81))).toBe(false);
    expect(ok(signalSchema, '')).toBe(false);
    expect(ok(signalSchema, 'check out https://spam.example')).toBe(false);
    expect(ok(signalSchema, `hi${u(0x202e)}there`)).toBe(false);
  });
  it('setSignalSchema wraps it', () => {
    expect(setSignalSchema.parse({ text: '  hello   world ' })).toEqual({ text: 'hello world' });
  });
});

describe('updateRanchSchema', () => {
  it('needs at least one field and drops anything unknown (no mass assignment)', () => {
    expect(ok(updateRanchSchema, {})).toBe(false);
    const parsed = updateRanchSchema.parse({
      displayName: 'New Name',
      handle: 'hacker',
      userId: 'x',
      status: 'suspended',
      role: 'admin',
    });
    expect(parsed).toEqual({ displayName: 'New Name' });
  });
  it('validates each enum', () => {
    expect(ok(updateRanchSchema, { portraitTint: 'mint' })).toBe(true);
    expect(ok(updateRanchSchema, { portraitTint: 'neon' })).toBe(false);
    expect(ok(updateRanchSchema, { ranchVisibility: 'everyone', signalVisibility: 'posse' })).toBe(true);
    expect(ok(updateRanchSchema, { ranchVisibility: 'public' })).toBe(false);
    expect(ok(updateRanchSchema, { signalVisibility: null })).toBe(false);
  });
});

describe('handleParamSchema', () => {
  it('lower-cases and accepts only the handle shape', () => {
    expect(handleParamSchema.parse('ChIrU_01')).toBe('chiru_01');
    for (const bad of ['', 'ab', 'a'.repeat(25), '../etc', 'a b c', "x'; drop table users;--", 'é', '%2e%2e'])
      expect(ok(handleParamSchema, bad), bad).toBe(false);
  });
});

describe('normaliseText', () => {
  it('is idempotent', () => {
    const once = normaliseText('  A   b\tc ');
    expect(normaliseText(once)).toBe(once);
  });
});
