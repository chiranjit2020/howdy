import { describe, expect, it } from 'vitest';
import { capitaliseName, nameFromHandle } from '@/shared/names';
import { displayNameSchema } from '@/shared/validation/profile';

describe('display names are capitalised word by word (2026-11-10)', () => {
  it('raises the first letter of each word and leaves the rest as typed', () => {
    expect(capitaliseName('asha k')).toBe('Asha K');
    expect(capitaliseName('ravi kumar sharma')).toBe('Ravi Kumar Sharma');
    expect(capitaliseName('McDonald')).toBe('McDonald');
    expect(capitaliseName('DJ rao')).toBe('DJ Rao');
    expect(capitaliseName("d'souza")).toBe("D'souza");
    expect(capitaliseName('jean-luc')).toBe('Jean-Luc');
    expect(capitaliseName('Asha')).toBe('Asha');
  });

  it('leaves scripts without capitals, digits and emoji alone', () => {
    expect(capitaliseName('अनन्या')).toBe('अनन्या');
    expect(capitaliseName('চিরঞ্জিৎ')).toBe('চিরঞ্জিৎ');
    expect(capitaliseName('2k crew')).toBe('2k Crew');
    expect(capitaliseName('🌻 sunny')).toBe('🌻 Sunny');
  });

  it('a new account without a typed name reads its username: underscores become spaces', () => {
    expect(nameFromHandle('asha_k')).toBe('Asha K');
    expect(nameFromHandle('rickdev')).toBe('Rickdev');
    expect(nameFromHandle('_meera__2001_')).toBe('Meera 2001');
    expect(nameFromHandle('___')).toBe('___');
  });

  it('every saved name goes through it (sign-up, Google, Settings share the schema)', () => {
    expect(displayNameSchema.parse('  priya   nair ')).toBe('Priya Nair');
    expect(displayNameSchema.safeParse('asha@home').success).toBe(false);
  });
});
