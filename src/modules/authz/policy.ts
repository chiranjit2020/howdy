import type { RelationshipState } from '@/shared/relationship';
import type { Visibility } from '@/shared/validation/profile';

/**
 * Central authorisation policy. Pure and synchronous: callers load the facts (who is asking, who owns the resource,
 * the resource's privacy settings, the relationship) and this function decides. Nothing else may implement access
 * rules — controllers, pages and components only ask `can()`.
 *
 * A user may act only if: authenticated (when required) + the resource exists (caller) + the relationship permits +
 * the privacy setting permits + the account is active + the rate limit permits (caller). This covers the middle four.
 */

export type Actor =
  { kind: 'anonymous' } | { kind: 'user'; id: string; status: 'active' | 'suspended' | 'pending_deletion' };

/**
 * `user:interact` = reaching out to another person (ask to join their Posse, scout, mark close, accept a request).
 * Removing things (leave, decline, unblock, unmute…) is never gated by it: undoing must always be possible.
 */
export type Action =
  | 'profile:view'
  | 'signal:view'
  | 'profile:edit'
  | 'signal:set'
  | 'user:interact'
  /** Exchange Whispers with the person who owns the resource: needs a mutual Posse and no block either way. */
  | 'whisper:exchange';

/** The facts about a Ranch that authorisation depends on. */
export interface RanchResource {
  ownerId: string;
  ranchVisibility: Visibility;
  signalVisibility: Visibility;
}

export interface PolicyContext {
  /** How the resource OWNER regards the actor. Ignored for anonymous actors. */
  relationship: RelationshipState;
}

export type DenyReason = 'unauthenticated' | 'account_status' | 'blocked' | 'not_visible' | 'not_owner';
export type Decision = { allow: true } | { allow: false; reason: DenyReason };

const ALLOW: Decision = { allow: true };
const deny = (reason: DenyReason): Decision => ({ allow: false, reason });

const IN_POSSE: ReadonlySet<RelationshipState> = new Set(['POSSE', 'CLOSE_POSSE']);

/** Does `actor` satisfy a visibility level? (The owner and block checks happen before this.) */
function satisfies(level: Visibility, actor: Actor, relationship: RelationshipState): Decision {
  if (level === 'everyone') return ALLOW;
  if (actor.kind === 'anonymous') return deny('unauthenticated');
  if (level === 'members') return ALLOW;
  // posse: requires a mutual relationship. SCOUTING is one-way (the actor watches the owner), so it does not qualify;
  // MUTED / RESTRICTED limit interactions, not who may look, so they follow the same rule as a stranger.
  return IN_POSSE.has(relationship) ? ALLOW : deny('not_visible');
}

export function can(actor: Actor, action: Action, resource: RanchResource, ctx: PolicyContext): Decision {
  if (actor.kind === 'user' && actor.status !== 'active') return deny('account_status');
  const isOwner = actor.kind === 'user' && actor.id === resource.ownerId;

  switch (action) {
    case 'profile:edit':
    case 'signal:set':
      if (actor.kind === 'anonymous') return deny('unauthenticated');
      return isOwner ? ALLOW : deny('not_owner');

    case 'user:interact':
      if (actor.kind === 'anonymous') return deny('unauthenticated');
      if (isOwner) return deny('not_visible'); // you cannot interact with yourself
      // A block in either direction ends every interaction. The relationship input is BLOCKED when EITHER side blocked.
      return ctx.relationship === 'BLOCKED' ? deny('blocked') : ALLOW;

    case 'whisper:exchange':
      if (actor.kind === 'anonymous') return deny('unauthenticated');
      if (isOwner) return deny('not_visible'); // no Whispers to yourself
      if (ctx.relationship === 'BLOCKED') return deny('blocked');
      // Private conversation: only people who are in each other's Posse. Being muted or restricted does not remove the
      // right (those change where the words go); scouting and pending requests grant nothing.
      return IN_POSSE.has(ctx.relationship) ? ALLOW : deny('not_visible');

    case 'profile:view':
    case 'signal:view': {
      if (isOwner) return ALLOW;
      // Block overrides every privacy setting, including "everyone".
      if (actor.kind === 'user' && ctx.relationship === 'BLOCKED') return deny('blocked');
      const ranch = satisfies(resource.ranchVisibility, actor, ctx.relationship);
      if (!ranch.allow || action === 'profile:view') return ranch;
      // A Signal is only reachable through the Ranch, so its effective visibility can never be broader than the
      // Ranch's: it must satisfy BOTH settings.
      return satisfies(resource.signalVisibility, actor, ctx.relationship);
    }
  }
}

/* ---------------------------------------------------------------------------------------------------------------------
 * The Fence (Phase 5). Same rules, same single place. A Fence is part of a Ranch, so reading it needs the Ranch to be
 * open to you AND the Fence's own visibility to admit you; writing on it needs reading it AND the owner's posting rule.
 * ------------------------------------------------------------------------------------------------------------------ */

export type FencePostingLevel = 'members' | 'posse' | 'nobody';

export interface FenceResource extends RanchResource {
  fenceVisibility: Visibility;
  fencePosting: FencePostingLevel;
  /** Every card from someone else waits for the owner's approval. */
  fenceReview: boolean;
}

export interface FenceContext extends PolicyContext {
  /** The owner has restricted the actor. Kept apart from `relationship` because a restricted Posse member is still POSSE. */
  restricted: boolean;
}

/**
 * - `fence:read`     see the cards on a Fence
 * - `fence:post`     nail a card / write a reply (both follow the owner's posting rule)
 * - `fence:react`    give a Yo (needs only the right to read; it is not writing)
 * - `fence:moderate` remove anything on the Fence, approve held cards (owner only)
 */
export type FenceAction = 'fence:read' | 'fence:post' | 'fence:react' | 'fence:moderate';

export function canFence(
  actor: Actor,
  action: FenceAction,
  fence: FenceResource,
  ctx: FenceContext,
): Decision {
  if (actor.kind === 'user' && actor.status !== 'active') return deny('account_status');
  const isOwner = actor.kind === 'user' && actor.id === fence.ownerId;

  if (action === 'fence:moderate') {
    if (actor.kind === 'anonymous') return deny('unauthenticated');
    return isOwner ? ALLOW : deny('not_owner');
  }
  if (isOwner) return ALLOW; // the owner reads, writes and reacts on their own Fence

  // Block overrides every setting, including "everyone".
  if (actor.kind === 'user' && ctx.relationship === 'BLOCKED') return deny('blocked');
  const ranch = satisfies(fence.ranchVisibility, actor, ctx.relationship);
  if (!ranch.allow) return ranch;
  const read = satisfies(fence.fenceVisibility, actor, ctx.relationship);
  if (!read.allow) return read;
  if (action === 'fence:read') return ALLOW;

  // Reacting and writing need an account (signed-out visitors may be allowed to *read* an "everyone" Fence).
  if (actor.kind === 'anonymous') return deny('unauthenticated');
  if (action === 'fence:react') return ALLOW;

  // fence:post — the owner's posting rule.
  switch (fence.fencePosting) {
    case 'members':
      return ALLOW;
    case 'posse':
      return IN_POSSE.has(ctx.relationship) ? ALLOW : deny('not_visible');
    case 'nobody':
      return deny('not_visible');
  }
}

/**
 * Where does a new card or reply go?
 * - the owner's own words are always `published`;
 * - a card on a Fence with Review on is `pending` for everyone (honest: its author is told it is waiting);
 * - otherwise someone the owner has restricted is `held` (cards and replies): it waits for the owner but looks posted to
 *   its author, who is never told they are restricted.
 */
export function holdFor(
  actor: Actor,
  kind: 'card' | 'reply',
  fence: FenceResource,
  ctx: FenceContext,
): 'published' | 'pending' | 'held' {
  if (actor.kind === 'user' && actor.id === fence.ownerId) return 'published';
  if (kind === 'card' && fence.fenceReview) return 'pending';
  if (ctx.restricted) return 'held';
  return 'published';
}

/** The actor is denied *seeing* something. Callers show "not found" so a hidden Ranch is indistinguishable from a missing one. */
export function isHidden(decision: Decision): boolean {
  return !decision.allow;
}
