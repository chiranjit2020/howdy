import { describe, expect, it } from 'vitest';
import { can, type Action, type Actor } from '@/modules/authz';
import { RELATIONSHIP_STATES, type RelationshipState } from '@/shared/relationship';

/**
 * An independent oracle for giving Tributes and Marks (ADR-044), written from the product rule rather than from
 * policy.ts: an active account, a different person, no block either way, and EITHER a mutual Posse OR Town Hall
 * neighbours. Whispers never widen: neighbours who are not Pals still cannot exchange them.
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

function oracle(action: Action, actor: Actor, rel: RelationshipState, neighbour: boolean): boolean {
  if (actor.kind !== 'user' || actor.status !== 'active' || actor.id === OWNER) return false;
  if (rel === 'BLOCKED') return false;
  const pals = rel === 'POSSE' || rel === 'CLOSE_POSSE';
  return action === 'whisper:exchange' ? pals : pals || neighbour;
}

describe('can(): Tributes, Marks and Whispers with Town Hall neighbours (ADR-044)', () => {
  it('match an independent oracle over every action × actor × relationship × neighbour', () => {
    let n = 0;
    for (const action of ['tribute:give', 'mark:give', 'whisper:exchange'] as const)
      for (const { name, actor } of actors)
        for (const rel of RELATIONSHIP_STATES)
          for (const neighbour of [false, true]) {
            const got = can(actor, action, RANCH, { relationship: rel, neighbour }).allow;
            expect(got, `${action} · ${name} · ${rel} · neighbour=${neighbour}`).toBe(
              oracle(action, actor, rel, neighbour),
            );
            n += 1;
          }
    expect(n).toBe(3 * actors.length * RELATIONSHIP_STATES.length * 2);
  });

  it('a neighbour who is not a Pal may give a Mark or a Tribute, but never Whisper', () => {
    const me: Actor = { kind: 'user', id: ME, status: 'active' };
    const ctx = { relationship: 'UNKNOWN' as RelationshipState, neighbour: true };
    expect(can(me, 'mark:give', RANCH, ctx).allow).toBe(true);
    expect(can(me, 'tribute:give', RANCH, ctx).allow).toBe(true);
    expect(can(me, 'whisper:exchange', RANCH, ctx).allow).toBe(false);
  });

  it('a block beats being neighbours', () => {
    const me: Actor = { kind: 'user', id: ME, status: 'active' };
    expect(can(me, 'mark:give', RANCH, { relationship: 'BLOCKED', neighbour: true })).toEqual({
      allow: false,
      reason: 'blocked',
    });
  });
});
