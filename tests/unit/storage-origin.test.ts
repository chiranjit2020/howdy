import { describe, expect, it } from 'vitest';
import { uploadOrigin } from '@/platform/storage/origin';

const ACCOUNT = '0123456789abcdef0123456789abcdef';

describe('uploadOrigin (the one extra origin the CSP lets pages upload to)', () => {
  it('is the R2 endpoint for a real account, and only then', () => {
    expect(uploadOrigin('r2', ACCOUNT)).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(uploadOrigin('local', ACCOUNT)).toBeUndefined();
    expect(uploadOrigin(undefined, ACCOUNT)).toBeUndefined();
    expect(uploadOrigin('r2', undefined)).toBeUndefined();
  });

  it('never lets a malformed account id put anything unexpected into the policy', () => {
    for (const bad of [
      '',
      'x',
      `${ACCOUNT}.evil.example`,
      `${ACCOUNT} https://evil.example`,
      `${ACCOUNT}\n`,
      '*',
    ]) {
      expect(uploadOrigin('r2', bad), JSON.stringify(bad)).toBeUndefined();
    }
  });
});
