import { describe, expect, it } from 'vitest';
import {
  canFence,
  holdFor,
  type Actor,
  type FenceAction,
  type FenceContext,
  type FencePostingLevel,
  type FenceResource,
} from '@/modules/authz';
import { RELATIONSHIP_STATES, type RelationshipState } from '@/shared/relationship';
import type { Visibility } from '@/shared/validation/profile';

/**
 * An independent oracle: written as plain rules from the product spec, not by reading policy.ts. The implementation and the
 * oracle are compared over EVERY combination of actor, relationship, settings and action, so a change to either one that
 * alters any single answer fails here.
 */
const OWNER = 'owner';
const STRANGER = 'someone';
const LEVELS: Visibility[] = ['everyone', 'members', 'posse'];
const POSTING: FencePostingLevel[] = ['members', 'posse', 'nobody'];
const ACTIONS: FenceAction[] = ['fence:read', 'fence:post', 'fence:react', 'fence:moderate'];

const actors: Array<{ name: string; actor: Actor }> = [
  { name: 'anonymous', actor: { kind: 'anonymous' } },
  { name: 'owner', actor: { kind: 'user', id: OWNER, status: 'active' } },
  { name: 'active user', actor: { kind: 'user', id: STRANGER, status: 'active' } },
  { name: 'suspended user', actor: { kind: 'user', id: STRANGER, status: 'suspended' } },
  { name: 'user being deleted', actor: { kind: 'user', id: STRANGER, status: 'pending_deletion' } },
  { name: 'suspended owner', actor: { kind: 'user', id: OWNER, status: 'suspended' } },
];

const inPosse = (r: RelationshipState) => r === 'POSSE' || r === 'CLOSE_POSSE';

function admits(level: Visibility, signedIn: boolean, r: RelationshipState): boolean {
  if (level === 'everyone') return true;
  if (!signedIn) return false;
  if (level === 'members') return true;
  return inPosse(r);
}

function oracle(
  actor: Actor,
  action: FenceAction,
  f: FenceResource,
  r: RelationshipState,
): { allow: boolean } {
  const signedIn = actor.kind === 'user';
  if (signedIn && actor.status !== 'active') return { allow: false };
  const owner = signedIn && actor.id === OWNER;
  if (action === 'fence:moderate') return { allow: owner };
  if (owner) return { allow: true };
  if (signedIn && r === 'BLOCKED') return { allow: false };
  const canRead = admits(f.ranchVisibility, signedIn, r) && admits(f.fenceVisibility, signedIn, r);
  if (!canRead) return { allow: false };
  if (action === 'fence:read') return { allow: true };
  if (!signedIn) return { allow: false };
  if (action === 'fence:react') return { allow: true };
  if (f.fencePosting === 'nobody') return { allow: false };
  if (f.fencePosting === 'posse') return { allow: inPosse(r) };
  return { allow: true };
}

describe('canFence matches an independent oracle over every combination', () => {
  it('covers actors × relationships × ranch × fence × posting × review × restricted × actions', () => {
    let checked = 0;
    for (const { name, actor } of actors)
      for (const relationship of RELATIONSHIP_STATES)
        for (const ranchVisibility of LEVELS)
          for (const fenceVisibility of LEVELS)
            for (const fencePosting of POSTING)
              for (const action of ACTIONS) {
                const fence: FenceResource = {
                  ownerId: OWNER,
                  ranchVisibility,
                  signalVisibility: 'members',
                  fenceVisibility,
                  fencePosting,
                  fenceReview: false,
                };
                const ctx: FenceContext = { relationship, restricted: false };
                const got = canFence(actor, action, fence, ctx).allow;
                const want = oracle(actor, action, fence, relationship).allow;
                expect(
                  got,
                  `${name} / ${relationship} / ranch=${ranchVisibility} fence=${fenceVisibility} posting=${fencePosting} / ${action}`,
                ).toBe(want);
                checked++;
              }
    expect(checked).toBe(
      actors.length * RELATIONSHIP_STATES.length * LEVELS.length ** 2 * POSTING.length * ACTIONS.length,
    );
  });

  it('a block beats "everyone" for people, but signed-out visitors (who cannot be identified) still read', () => {
    const fence: FenceResource = {
      ownerId: OWNER,
      ranchVisibility: 'everyone',
      signalVisibility: 'everyone',
      fenceVisibility: 'everyone',
      fencePosting: 'members',
      fenceReview: false,
    };
    const blocked = { relationship: 'BLOCKED', restricted: false } as const;
    const user: Actor = { kind: 'user', id: STRANGER, status: 'active' };
    for (const action of ['fence:read', 'fence:post', 'fence:react'] as const) {
      expect(canFence(user, action, fence, blocked).allow).toBe(false);
    }
    expect(canFence({ kind: 'anonymous' }, 'fence:read', fence, blocked).allow).toBe(true);
  });

  it('being restricted or muted never changes who may read or write (it changes where the words go)', () => {
    const fence: FenceResource = {
      ownerId: OWNER,
      ranchVisibility: 'members',
      signalVisibility: 'members',
      fenceVisibility: 'members',
      fencePosting: 'posse',
      fenceReview: false,
    };
    const user: Actor = { kind: 'user', id: STRANGER, status: 'active' };
    for (const restricted of [false, true])
      expect(canFence(user, 'fence:post', fence, { relationship: 'POSSE', restricted }).allow).toBe(true);
  });
});

describe('holdFor: where a new card or reply goes', () => {
  const base: FenceResource = {
    ownerId: OWNER,
    ranchVisibility: 'members',
    signalVisibility: 'members',
    fenceVisibility: 'members',
    fencePosting: 'members',
    fenceReview: false,
  };
  const user: Actor = { kind: 'user', id: STRANGER, status: 'active' };
  const owner: Actor = { kind: 'user', id: OWNER, status: 'active' };

  // Oracle: owner → published. Card with Review on → pending (whoever wrote it). Else restricted → held. Else published.
  it('matches the oracle for every combination', () => {
    for (const review of [false, true])
      for (const restricted of [false, true])
        for (const kind of ['card', 'reply'] as const)
          for (const who of [owner, user]) {
            const got = holdFor(
              who,
              kind,
              { ...base, fenceReview: review },
              { relationship: 'POSSE', restricted },
            );
            const isOwner = who === owner;
            const want = isOwner
              ? 'published'
              : kind === 'card' && review
                ? 'pending'
                : restricted
                  ? 'held'
                  : 'published';
            expect(
              got,
              `${isOwner ? 'owner' : 'other'} ${kind} review=${review} restricted=${restricted}`,
            ).toBe(want);
          }
  });

  it('a restricted writer is held silently ("held"), never "pending" — pending is the honest, told-to-the-writer state', () => {
    expect(holdFor(user, 'card', base, { relationship: 'POSSE', restricted: true })).toBe('held');
    expect(holdFor(user, 'reply', base, { relationship: 'POSSE', restricted: true })).toBe('held');
  });
});
