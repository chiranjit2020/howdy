import { describe, expect, it } from 'vitest';
import { EMPTY_POST_MESSAGE, postCardSchema } from '@/shared/validation/fence';
import { hallPostSchema } from '@/shared/validation/town-halls';

/** 2026-11-07: most people post a photo on its own. A post is words OR a photo — never neither. */
const PHOTO = '0b8d4f5e-2c3a-4b6d-9e1f-7a8b9c0d1e2f';

describe.each([
  ['a wall post', postCardSchema],
  ['a group post', hallPostSchema],
])('%s', (_, schema) => {
  it('a photo with no words is a whole post (missing, empty or only spaces)', () => {
    for (const body of [undefined, '', '   \n ']) {
      const r = schema.safeParse({ ...(body === undefined ? {} : { body }), photoId: PHOTO });
      expect(r.success).toBe(true);
      expect(r.data?.body).toBe('');
    }
  });
  it('words with no photo still work, and neither is refused with a plain message on the words', () => {
    expect(schema.safeParse({ body: 'Chai on the balcony' }).success).toBe(true);
    for (const empty of [{}, { body: '' }, { body: '   ' }]) {
      const r = schema.safeParse(empty);
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(['body']);
      expect(r.error?.issues[0]?.message).toBe(EMPTY_POST_MESSAGE);
    }
  });
  it('the usual screening still applies to words that are there', () => {
    expect(schema.safeParse({ body: 'see https://spam.example', photoId: PHOTO }).success).toBe(false);
  });
});
