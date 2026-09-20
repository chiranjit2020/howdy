import { describe, expect, it } from 'vitest';
import { can, isHidden, type Actor, type RanchResource } from '@/modules/authz';
import { RELATIONSHIP_STATES, type RelationshipState } from '@/shared/relationship';
import { VISIBILITIES, type Visibility } from '@/shared/validation/profile';

const OWNER = 'owner-id';
const owner: Actor = { kind: 'user', id: OWNER, status: 'active' };
const stranger: Actor = { kind: 'user', id: 'someone-else', status: 'active' };
const anonymous: Actor = { kind: 'anonymous' };
const suspended: Actor = { kind: 'user', id: 'sus', status: 'suspended' };
const deleting: Actor = { kind: 'user', id: 'del', status: 'pending_deletion' };

const ranch = (r: Visibility, s: Visibility): RanchResource => ({
  ownerId: OWNER,
  ranchVisibility: r,
  signalVisibility: s,
});

/**
 * An INDEPENDENT oracle (numeric clearance levels) rather than a copy of the implementation, so a bug in the policy
 * cannot hide behind an identical bug in the test.
 *   required level:  everyone 0, members 1, posse 2
 *   actor clearance: anonymous 0, signed-in stranger 1, mutual Posse member 2
 */
const REQUIRED: Record<Visibility, number> = { everyone: 0, members: 1, posse: 2 };
function clearance(actor: Actor, rel: RelationshipState): number {
  if (actor.kind === 'anonymous') return 0;
  return rel === 'POSSE' || rel === 'CLOSE_POSSE' ? 2 : 1;
}
function expectedView(
  actor: Actor,
  action: 'profile:view' | 'signal:view',
  r: Visibility,
  s: Visibility,
  rel: RelationshipState,
): boolean {
  if (actor.kind === 'user' && actor.status !== 'active') return false;
  if (actor.kind === 'user' && actor.id === OWNER) return true;
  if (actor.kind === 'user' && rel === 'BLOCKED') return false;
  const c = clearance(actor, rel);
  const ranchOk = c >= REQUIRED[r];
  return action === 'profile:view' ? ranchOk : ranchOk && c >= REQUIRED[s];
}

describe('can(): viewing a Ranch or a Signal, exhaustively', () => {
  const actors: [string, Actor][] = [
    ['owner', owner],
    ['stranger', stranger],
    ['anonymous', anonymous],
    ['suspended', suspended],
    ['pending deletion', deleting],
  ];
  for (const [name, actor] of actors) {
    for (const action of ['profile:view', 'signal:view'] as const) {
      it(`${name} · ${action}: all ${VISIBILITIES.length ** 2 * RELATIONSHIP_STATES.length} visibility × relationship combinations`, () => {
        for (const r of VISIBILITIES) {
          for (const s of VISIBILITIES) {
            for (const rel of RELATIONSHIP_STATES) {
              const got = can(actor, action, ranch(r, s), { relationship: rel }).allow;
              expect(got, `${name} ${action} ranch=${r} signal=${s} rel=${rel}`).toBe(
                expectedView(actor, action, r, s, rel),
              );
            }
          }
        }
      });
    }
  }
});

describe('can(): properties that must always hold', () => {
  const all = () => {
    const out: { r: Visibility; s: Visibility; rel: RelationshipState }[] = [];
    for (const r of VISIBILITIES)
      for (const s of VISIBILITIES) for (const rel of RELATIONSHIP_STATES) out.push({ r, s, rel });
    return out;
  };

  it('a block overrides every privacy setting, including "everyone"', () => {
    for (const { r, s } of all()) {
      expect(can(stranger, 'profile:view', ranch(r, s), { relationship: 'BLOCKED' }).allow).toBe(false);
      expect(can(stranger, 'signal:view', ranch(r, s), { relationship: 'BLOCKED' }).allow).toBe(false);
    }
    expect(can(stranger, 'profile:view', ranch('everyone', 'everyone'), { relationship: 'BLOCKED' })).toEqual(
      { allow: false, reason: 'blocked' },
    );
  });

  it('the owner always sees their own Ranch and Signal, whatever they set (and even if they "block" themselves)', () => {
    for (const { r, s, rel } of all()) {
      expect(can(owner, 'profile:view', ranch(r, s), { relationship: rel }).allow).toBe(true);
      expect(can(owner, 'signal:view', ranch(r, s), { relationship: rel }).allow).toBe(true);
    }
  });

  it('a Signal is never visible to someone who cannot open the Ranch (effective visibility is the intersection)', () => {
    for (const actor of [stranger, anonymous]) {
      for (const { r, s, rel } of all()) {
        const c = { relationship: rel };
        if (!can(actor, 'profile:view', ranch(r, s), c).allow)
          expect(can(actor, 'signal:view', ranch(r, s), c).allow).toBe(false);
      }
    }
  });

  it('anonymous visitors see something only when the Ranch is set to "everyone"', () => {
    for (const { r, s, rel } of all()) {
      expect(can(anonymous, 'profile:view', ranch(r, s), { relationship: rel }).allow).toBe(r === 'everyone');
    }
  });

  it('one-way SCOUTING, REQUESTED and PASSERBY do not unlock "posse" visibility; only mutual Posse does', () => {
    for (const rel of ['SCOUTING', 'REQUESTED', 'PASSERBY', 'UNKNOWN', 'MUTED', 'RESTRICTED'] as const) {
      expect(can(stranger, 'profile:view', ranch('posse', 'posse'), { relationship: rel }).allow).toBe(false);
    }
    for (const rel of ['POSSE', 'CLOSE_POSSE'] as const) {
      expect(can(stranger, 'profile:view', ranch('posse', 'posse'), { relationship: rel }).allow).toBe(true);
    }
  });

  it('non-active accounts are denied everything, even their own Ranch', () => {
    for (const actor of [suspended, deleting]) {
      for (const action of ['profile:view', 'signal:view', 'profile:edit', 'signal:set'] as const) {
        expect(
          can({ ...actor, id: OWNER } as Actor, action, ranch('everyone', 'everyone'), {
            relationship: 'POSSE',
          }),
        ).toEqual({ allow: false, reason: 'account_status' });
      }
    }
  });

  it('isHidden mirrors a denial', () => {
    expect(
      isHidden(can(anonymous, 'profile:view', ranch('members', 'members'), { relationship: 'UNKNOWN' })),
    ).toBe(true);
    expect(
      isHidden(can(owner, 'profile:view', ranch('members', 'members'), { relationship: 'UNKNOWN' })),
    ).toBe(false);
  });
});

describe('can(): editing', () => {
  const edits = ['profile:edit', 'signal:set'] as const;
  it('only the owner may edit', () => {
    for (const action of edits) {
      expect(can(owner, action, ranch('members', 'members'), { relationship: 'UNKNOWN' }).allow).toBe(true);
      expect(can(stranger, action, ranch('everyone', 'everyone'), { relationship: 'CLOSE_POSSE' })).toEqual({
        allow: false,
        reason: 'not_owner',
      });
      expect(can(anonymous, action, ranch('everyone', 'everyone'), { relationship: 'UNKNOWN' })).toEqual({
        allow: false,
        reason: 'unauthenticated',
      });
    }
  });

  it("being in someone's Posse never grants edit rights", () => {
    for (const rel of RELATIONSHIP_STATES) {
      for (const action of edits)
        expect(can(stranger, action, ranch('everyone', 'everyone'), { relationship: rel }).allow).toBe(false);
    }
  });
});
