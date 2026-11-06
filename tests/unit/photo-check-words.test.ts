import { describe, expect, it } from 'vitest';
import { readPhotoCheck } from '@/shared/photo-check-words';

describe('reading the photo check report for a moderator', () => {
  it('a check that could not run says so, with no scores', () => {
    expect(readPhotoCheck('Photo check could not run (401); held to be safe.')).toEqual({
      down: true,
      saw: [],
    });
    expect(readPhotoCheck('Photo check could not run; held to be safe.')).toEqual({ down: true, saw: [] });
  });
  it('scores become everyday words, most likely first, each kind once', () => {
    expect(readPhotoCheck('Photo check: violence 0.62, sexual 0.10, violence/graphic 0.04')).toEqual({
      down: false,
      saw: ['violence (62% sure)', 'sexual content (10% sure)', 'graphic violence (4% sure)'],
    });
    expect(readPhotoCheck('Photo check: self-harm/intent 0.50, self-harm 0.30').saw).toEqual([
      'self-harm (50% sure)',
    ]);
  });
  it('a flag with no scores reads as nothing specific', () => {
    expect(readPhotoCheck('Photo check: flagged')).toEqual({ down: false, saw: [] });
  });
});
