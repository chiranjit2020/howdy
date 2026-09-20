import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '@/platform/cursor';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('keyset cursor', () => {
  it('round-trips exactly, to the millisecond', () => {
    const at = new Date('2026-03-04T05:06:07.089Z');
    expect(decodeCursor(encodeCursor({ at, id: ID }))).toEqual({ at, id: ID });
  });

  it('refuses anything that is not exactly <ms>.<uuid> in base64url', () => {
    const b64 = (s: string) => Buffer.from(s).toString('base64url');
    const bad = [
      '',
      'A'.repeat(101),
      'not a cursor',
      "'; drop table post_cards;--",
      b64('1'),
      b64(`.${ID}`),
      b64(`abc.${ID}`),
      b64('123.notauuid'),
      b64(`123.${ID} `),
      b64(`123.${ID}.extra`),
      b64(`-5.${ID}`),
      b64(`9999999999999999999.${ID}`),
      b64(`8640000000000001.${ID}`),
      b64(`123.${ID.toUpperCase()}`),
    ];
    for (const raw of bad) expect(decodeCursor(raw), raw.slice(0, 30)).toBeNull();
  });
});
