import { describe, expect, it } from 'vitest';
import { REPORT_DETAILS_MAX, REPORT_REASONS, reportSchema } from '@/shared/validation/moderation';
import { RELATIONSHIP_ACTIONS, relationshipActionSchema } from '@/shared/validation/relationships';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;
const u = (cp: number) => String.fromCodePoint(cp);

describe('relationshipActionSchema', () => {
  it('accepts exactly the closed set of verbs', () => {
    expect(RELATIONSHIP_ACTIONS).toHaveLength(15);
    for (const action of RELATIONSHIP_ACTIONS) expect(ok(relationshipActionSchema, { action })).toBe(true);
  });
  it.each([
    'befriend',
    'follow',
    'REQUEST',
    ' request',
    'request ',
    '',
    'block; drop table x',
    42,
    null,
    undefined,
    {},
    [],
  ])('rejects %j', (action) => {
    expect(ok(relationshipActionSchema, { action })).toBe(false);
  });
  it('ignores extra keys', () => {
    expect(relationshipActionSchema.parse({ action: 'mute', userId: 'x', admin: true })).toEqual({
      action: 'mute',
    });
  });
});

describe('reportSchema', () => {
  const base = { handle: 'Some_User', reason: 'spam' };
  it('normalises the handle and accepts every reason', () => {
    expect(reportSchema.parse(base).handle).toBe('some_user');
    for (const reason of REPORT_REASONS) expect(ok(reportSchema, { ...base, reason })).toBe(true);
  });
  it('bounds and cleans details, but allows links', () => {
    expect(ok(reportSchema, { ...base, details: 'x'.repeat(REPORT_DETAILS_MAX) })).toBe(true);
    expect(ok(reportSchema, { ...base, details: 'x'.repeat(REPORT_DETAILS_MAX + 1) })).toBe(false);
    expect(ok(reportSchema, { ...base, details: 'evidence: https://evil.example/x' })).toBe(true);
    expect(ok(reportSchema, { ...base, details: `a${u(0x202e)}b` })).toBe(false);
    expect(ok(reportSchema, { ...base, details: `a${u(0x200b)}b` })).toBe(false);
    expect(reportSchema.parse({ ...base, details: '  a   b  ' }).details).toBe('a b');
  });
  it('rejects a bad handle, reason, or a missing reason; drops unknown keys', () => {
    expect(ok(reportSchema, { ...base, handle: '../x' })).toBe(false);
    expect(ok(reportSchema, { ...base, reason: 'rude' })).toBe(false);
    expect(ok(reportSchema, { handle: 'someone' })).toBe(false);
    expect(reportSchema.parse({ ...base, status: 'actioned', reporterId: 'x' })).toEqual({
      handle: 'some_user',
      reason: 'spam',
    });
  });
});
