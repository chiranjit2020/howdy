import { handleEvent } from '@/modules/notifications';
import { handleEvent as handleTrackEvent } from '@/modules/tracks';
import { handleEvent as handleTrustEvent } from '@/modules/trust';
import { subscribe } from '@/platform/events';
import { ringLive } from '@/platform/live-ping';
import { publishToUser } from '@/platform/realtime';

/**
 * Connects the domain events to the modules that listen to them. This is the ONE place that knows both sides, so `relationships`
 * `fence`, `whispers` and `profiles` (which emit) and `notifications` / `tracks` / `trust` (which listen) never depend on each other. Loaded once at start-up by
 * `src/instrumentation.ts`, by the WebSocket process, and by the test setup.
 */
subscribe(handleEvent);
subscribe(handleTrackEvent);
subscribe(handleTrustEvent);

// Live delivery: tell the recipient's open sockets (and the sender's other devices) there is a new Whisper to look at. Words
// held back from the recipient are never announced to them.
subscribe(async (event) => {
  if (event.type !== 'whisper.sent') return;
  const hint = { kind: 'whisper', conversationId: event.conversationId, seq: event.seq } as const;
  await Promise.all([
    event.held ? Promise.resolve() : publishToUser(event.recipientId, hint),
    publishToUser(event.senderId, hint),
    // The same through Ably (ADR-035): a word-free ring, the recipient only when the words are not held back.
    ringLive(event.held ? [event.senderId] : [event.recipientId, event.senderId]),
  ]);
});
