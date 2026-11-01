import { describe, expect, it } from 'vitest';
import { can, type Action, type Actor } from '@/modules/authz';
import { RELATIONSHIP_STATES, type RelationshipState } from '@/shared/relationship';

/**
 * An independent oracle for giving Tributes and Marks and exchanging Whispers, written from the product rule rather
 * than from policy.ts: an active account, a different person, no block either way, and a mutual Posse. Sharing a group
 * grants nothing (group neighbours could give Tributes and Marks under ADR-044, until groups became circles, ADR-054).
 */
const OWNER = 'other';
const ME = 'me';
const RANCH = { ownerId: OWNER, ranchVisibility: 'members', signalVisibility: 'members' } as const;
const actors: Array<{ name: string; actor: Actor }> = [
  { name: 'anonymous', actor: { kind: 'anonymous' } },
  { name: 'active', actor: { kind: 'user', id: ME, status: 'active' } },
  { name: 'suspended', actor: { kind: 'user', id: ME, status: 'suspended' } },
  { name: 'being deleted', actor: { kind: 'user', id: ME, status: 'pending_deletion' } },
  { name: 'the owner themselves', actor: { kind: 'user', id: OWNER, status: 'active' } },
];

function oracle(actor: Actor, rel: RelationshipState): boolean {
  if (actor.kind !== 'user' || actor.status !== 'active' || actor.id === OWNER) return false;
  if (rel === 'BLOCKED') return false;
  return rel === 'POSSE' || rel === 'CLOSE_POSSE';
}

describe('can(): Testimonials, Marks and messages are between friends (ADR-054)', () => {
  it('match an independent oracle over every action × actor × relationship', () => {
    let n = 0;
    for (const action of ['tribute:give', 'mark:give', 'whisper:exchange'] as Action[])
      for (const { name, actor } of actors)
        for (const rel of RELATIONSHIP_STATES) {
          expect(can(actor, action, RANCH, { relationship: rel }).allow, `${action} · ${name} · ${rel}`).toBe(
            oracle(actor, rel),
          );
          n += 1;
        }
    expect(n).toBe(3 * actors.length * RELATIONSHIP_STATES.length);
  });

  it('a block beats being friends', () => {
    const me: Actor = { kind: 'user', id: ME, status: 'active' };
    expect(can(me, 'mark:give', RANCH, { relationship: 'BLOCKED' })).toEqual({
      allow: false,
      reason: 'blocked',
    });
  });
});
