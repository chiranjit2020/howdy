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
  | { type: 'townhall.invited'; townHallId: string; ownerId: string; inviteeId: string }
  | { type: 'townhall.invite_accepted'; townHallId: string; ownerId: string; inviteeId: string };

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
