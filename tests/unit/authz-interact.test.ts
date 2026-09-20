import { describe, expect, it } from 'vitest';
import { can, type Actor } from '@/modules/authz';
import { RELATIONSHIP_STATES } from '@/shared/relationship';
import { VISIBILITIES } from '@/shared/validation/profile';

const OWNER = 'target-id';
const resource = (r: (typeof VISIBILITIES)[number], s: (typeof VISIBILITIES)[number]) => ({
  ownerId: OWNER,
  ranchVisibility: r,
  signalVisibility: s,
});

const actors: [string, Actor][] = [
  ['stranger', { kind: 'user', id: 'someone', status: 'active' }],
  ['the target themself', { kind: 'user', id: OWNER, status: 'active' }],
  ['anonymous', { kind: 'anonymous' }],
  ['suspended', { kind: 'user', id: 'sus', status: 'suspended' }],
  ['pending deletion', { kind: 'user', id: 'del', status: 'pending_deletion' }],
];

/** Independent statement of the rule: an active signed-in person may reach out to someone else unless a block exists. */
function expected(actor: Actor, relationship: string): boolean {
  return (
    actor.kind === 'user' && actor.status === 'active' && actor.id !== OWNER && relationship !== 'BLOCKED'
  );
}

describe('can(): user:interact (reaching out to another person)', () => {
  for (const [name, actor] of actors) {
    it(`${name}: every visibility × relationship combination`, () => {
      for (const r of VISIBILITIES) {
        for (const s of VISIBILITIES) {
          for (const rel of RELATIONSHIP_STATES) {
            expect(
              can(actor, 'user:interact', resource(r, s), { relationship: rel }).allow,
              `${name} ${r}/${s}/${rel}`,
            ).toBe(expected(actor, rel));
          }
        }
      }
    });
  }

  it('a block in either direction ends every interaction, whatever the privacy settings', () => {
    const stranger: Actor = { kind: 'user', id: 'someone', status: 'active' };
    expect(
      can(stranger, 'user:interact', resource('everyone', 'everyone'), { relationship: 'BLOCKED' }),
    ).toEqual({ allow: false, reason: 'blocked' });
  });

  it("privacy settings do not gate reaching out (you may ask to join a private Ranch's Posse)", () => {
    const stranger: Actor = { kind: 'user', id: 'someone', status: 'active' };
    for (const r of VISIBILITIES)
      expect(can(stranger, 'user:interact', resource(r, r), { relationship: 'PASSERBY' }).allow).toBe(true);
  });

  it('reports the right reason for each denial', () => {
    expect(
      can({ kind: 'anonymous' }, 'user:interact', resource('everyone', 'everyone'), {
        relationship: 'UNKNOWN',
      }),
    ).toEqual({ allow: false, reason: 'unauthenticated' });
    expect(
      can({ kind: 'user', id: OWNER, status: 'active' }, 'user:interact', resource('everyone', 'everyone'), {
        relationship: 'UNKNOWN',
      }),
    ).toEqual({ allow: false, reason: 'not_visible' });
    expect(
      can({ kind: 'user', id: 'x', status: 'suspended' }, 'user:interact', resource('everyone', 'everyone'), {
        relationship: 'UNKNOWN',
      }),
    ).toEqual({ allow: false, reason: 'account_status' });
  });
});
