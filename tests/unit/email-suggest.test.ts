import { describe, expect, it } from 'vitest';
import { suggestEmail } from '@/shared/email-suggest';

describe('"Did you mean…?" for the sign-up email', () => {
  it('fixes common slips in popular providers', () => {
    const cases: [string, string][] = [
      ['asha@gmial.com', 'asha@gmail.com'],
      ['asha@gamil.com', 'asha@gmail.com'],
      ['asha@gmal.com', 'asha@gmail.com'],
      ['asha@gmail.con', 'asha@gmail.com'],
      ['asha@gmail.co', 'asha@gmail.com'],
      ['asha@gnail.con', 'asha@gmail.com'],
      ['asha@yaho.com', 'asha@yahoo.com'],
      ['asha@yahoo.co.on', 'asha@yahoo.co.in'],
      ['asha@hotmial.com', 'asha@hotmail.com'],
      ['asha@outlok.com', 'asha@outlook.com'],
      ['asha@redifmail.com', 'asha@rediffmail.com'],
      ['Asha.Rao@GMIAL.COM', 'asha.rao@gmail.com'],
    ];
    for (const [typed, meant] of cases) expect(suggestEmail(typed), typed).toBe(meant);
  });

  it('fixes a ".con" on any domain', () => {
    expect(suggestEmail('ravi@mycompany.con')).toBe('ravi@mycompany.com');
    expect(suggestEmail('ravi@mycompany.cmo')).toBe('ravi@mycompany.com');
  });

  it('leaves correct addresses alone, including real domains that look like typos', () => {
    for (const email of [
      'asha@gmail.com',
      'asha@yahoo.co.in',
      'asha@mail.com',
      'asha@email.com',
      'asha@ymail.com',
      'asha@yahoo.in',
      'asha@gmx.com',
      'asha@live.in',
      'asha@mycompany.in',
      'asha@college.ac.in',
      'asha@example.cm', // Cameroon is real
    ]) {
      expect(suggestEmail(email), email).toBeNull();
    }
  });

  it('does not guess when the domain is too far from anything', () => {
    expect(suggestEmail('asha@chiranjitkarmakar.com')).toBeNull();
    expect(suggestEmail('asha@tcs.com')).toBeNull();
  });

  it('gives nothing for something that is not an email yet', () => {
    for (const v of ['', 'asha', 'asha@', '@gmail.com']) expect(suggestEmail(v), v).toBeNull();
  });
});
