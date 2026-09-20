import { describe, expect, it } from 'vitest';
import { can, type Actor } from '@/modules/authz';
import { RELATIONSHIP_STATES, type RelationshipState } from '@/shared/relationship';
import { VISIBILITIES } from '@/shared/validation/profile';

/**
 * An independent oracle for `whisper:exchange`, written from the product rule rather than from policy.ts: a private thread needs
 * an account that is in good standing, a different person, a mutual Posse, and no block in either direction. Nothing about the
 * Ranch's or Signal's visibility settings matters, and being muted or restricted does not remove the right.
 */
const OWNER = 'other';
const ME = 'me';
const actors: Array<{ name: string; actor: Actor }> = [
  { name: 'anonymous', actor: { kind: 'anonymous' } },
  { name: 'active', actor: { kind: 'user', id: ME, status: 'active' } },
  { name: 'suspended', actor: { kind: 'user', id: ME, status: 'suspended' } },
  { name: 'being deleted', actor: { kind: 'user', id: ME, status: 'pending_deletion' } },
  { name: 'the other person themselves', actor: { kind: 'user', id: OWNER, status: 'active' } },
];

function oracle(actor: Actor, rel: RelationshipState): boolean {
  if (actor.kind !== 'user') return false;
  if (actor.status !== 'active') return false;
  if (actor.id === OWNER) return false;
  if (rel === 'BLOCKED') return false;
  return rel === 'POSSE' || rel === 'CLOSE_POSSE';
}

describe('can(): whisper:exchange matches an independent oracle', () => {
  it('over every actor × relationship × visibility setting', () => {
    let n = 0;
    for (const { name, actor } of actors)
      for (const rel of RELATIONSHIP_STATES)
        for (const ranch of VISIBILITIES)
          for (const signal of VISIBILITIES) {
            const got = can(
              actor,
              'whisper:exchange',
              { ownerId: OWNER, ranchVisibility: ranch, signalVisibility: signal },
              { relationship: rel },
            ).allow;
            expect(got, `${name} / ${rel} / ranch=${ranch} signal=${signal}`).toBe(oracle(actor, rel));
            n++;
          }
    expect(n).toBe(actors.length * RELATIONSHIP_STATES.length * 9);
  });

  it('only a mutual Posse opens a thread — never a request, scouting, mute or restrict on their own', () => {
    const open = RELATIONSHIP_STATES.filter(
      (rel) =>
        can(
          { kind: 'user', id: ME, status: 'active' },
          'whisper:exchange',
          { ownerId: OWNER, ranchVisibility: 'everyone', signalVisibility: 'everyone' },
          { relationship: rel },
        ).allow,
    );
    expect(open.sort()).toEqual(['CLOSE_POSSE', 'POSSE']);
  });

  it('says WHY: a block is reported as a block, a non-Posse as not visible, a stranger with no account as unauthenticated', () => {
    const me: Actor = { kind: 'user', id: ME, status: 'active' };
    const res = { ownerId: OWNER, ranchVisibility: 'everyone', signalVisibility: 'everyone' } as const;
    expect(can(me, 'whisper:exchange', res, { relationship: 'BLOCKED' })).toEqual({
      allow: false,
      reason: 'blocked',
    });
    expect(can(me, 'whisper:exchange', res, { relationship: 'PASSERBY' })).toEqual({
      allow: false,
      reason: 'not_visible',
    });
    expect(can({ kind: 'anonymous' }, 'whisper:exchange', res, { relationship: 'POSSE' })).toEqual({
      allow: false,
      reason: 'unauthenticated',
    });
    expect(can({ ...me, status: 'suspended' }, 'whisper:exchange', res, { relationship: 'POSSE' })).toEqual({
      allow: false,
      reason: 'account_status',
    });
  });
});
