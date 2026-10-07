import { logger } from './logger';
import { runAfterResponse } from './background';

/**
 * Domain events: "something happened", stated in ids only. They are kept apart from notifications (master prompt §Notification)
 * so a module never has to know who is listening — `relationships` and `fence` emit, and `notifications` (or a future push or
 * email channel) subscribes. Handlers run AFTER the response, so what the person who acted receives can never depend on who
 * was told, and a failing handler can never fail (or slow) the action.
 */
export type DomainEvent =
  | { type: 'posse.requested'; actorId: string; targetId: string }
  | { type: 'posse.accepted'; actorId: string; targetId: string }
  | { type: 'card.created'; cardId: string; ownerId: string; authorId: string }
  /** A card is held for the Fence owner: Review turned on (`pending`) or the writer is Restricted (`held`). Deliberately alike. */
  | { type: 'card.waiting'; cardId: string; ownerId: string; authorId: string }
  | { type: 'card.approved'; cardId: string; ownerId: string; authorId: string; wasPending: boolean }
  | { type: 'reply.created'; cardId: string; ownerId: string; cardAuthorId: string; authorId: string }
  | { type: 'reply.waiting'; cardId: string; ownerId: string; authorId: string }
  /** A Whisper was stored. `held`: the sender is Restricted by the recipient, so it is never delivered or rung. */
  | {
      type: 'whisper.sent';
      conversationId: string;
      seq: number;
      senderId: string;
      recipientId: string;
      held: boolean;
    }
  /** A signed-in person opened someone else's Ranch (only ever emitted after the policy allowed the view). */
  | { type: 'ranch.visited'; viewerId: string; ownerId: string }
  | { type: 'yo.given'; cardId: string; ownerId: string; cardAuthorId: string; actorId: string }
  /** A Tribute always waits for the owner's approval — there is no fast path, so this alone tells nobody anything. */
  | { type: 'tribute.given'; tributeId: string; ownerId: string; authorId: string }
  | { type: 'tribute.approved'; tributeId: string; ownerId: string; authorId: string }
  /** Who gave it and which kind are never broadcast beyond the target (the Ranch shows only the aggregate breakdown). */
  | { type: 'mark.given'; raterId: string; targetId: string }
  /** The owner invited someone; they are not a member until they accept. */
  /** `inviterId`: the owner or the Deputy who sent it (ADR-041). */
  | { type: 'townhall.invited'; townHallId: string; inviterId: string; inviteeId: string }
  | { type: 'townhall.invite_accepted'; townHallId: string; ownerId: string; inviteeId: string }
  /** Someone asked to join a Town Hall that needs approval; every member of its staff hears (ADR-041). */
  | { type: 'townhall.join_requested'; townHallId: string; requesterId: string; staffIds: string[] }
  | { type: 'townhall.request_approved'; townHallId: string; approverId: string; requesterId: string }
  | { type: 'townhall.made_deputy'; townHallId: string; ownerId: string; deputyId: string }
  | { type: 'townhall.made_owner'; townHallId: string; fromId: string; toId: string }
  /** A published reply on a Town Hall post (ADR-033). Held replies emit nothing: only the owner sees them, in the feed. */
  | { type: 'hall.reply_created'; postId: string; postAuthorId: string; authorId: string }
  | { type: 'hall.reaction_given'; postId: string; postAuthorId: string; actorId: string }
  /** The photo check held an uploaded photo for a moderator (ADR-039); only its owner sees it meanwhile. */
  | {
      type: 'photo.held';
      mediaId: string;
      ownerId: string;
      kind: 'portrait' | 'card_photo';
      summary: string;
    }
  /** A Time Capsule opened (ADR-028). Author and recipient are the same person for a capsule to one's future self. */
  | { type: 'capsule.opened'; capsuleId: string; authorId: string; recipientId: string }
  /**
   * A brand-new account was made (never for an address that was already registered). `invite`: the invite code it
   * arrived with, unchecked — the invites module decides what it is worth (ADR-045).
   */
  | { type: 'account.created'; userId: string; invite: string | null }
  /** Someone confirmed their email address. */
  | { type: 'account.verified'; userId: string }
  /** A Pal reacted to a Story for the first time (changing the kind rings nothing, ADR-047). */
  | { type: 'story.reacted'; storyId: string; authorId: string; actorId: string };

export type EventHandler = (event: DomainEvent) => Promise<void>;

/** Kept on globalThis: Next may load this file once per server bundle, but there is one process and one set of listeners. */
const KEY = Symbol.for('howdy.domain-event-handlers');
type Registry = { handlers: Set<EventHandler> };
const registry = (): Registry => {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>;
  return (g[KEY] ??= { handlers: new Set() });
};

/** Listen to every event. Returns a function that stops listening. Subscribing the same handler twice is harmless. */
export function subscribe(handler: EventHandler): () => void {
  registry().handlers.add(handler);
  return () => registry().handlers.delete(handler);
}

/** Tell every listener what happened, after the response. Errors are logged and never reach the caller. */
export function emit(event: DomainEvent): void {
  runAfterResponse(`event:${event.type}`, async () => {
    for (const handler of registry().handlers) {
      try {
        await handler(event);
      } catch (err) {
        logger.error({ event: 'event.handler_failed', type: event.type, err });
      }
    }
  });
}
