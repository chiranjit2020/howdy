import { z } from 'zod';
import { logger } from './logger';
import { getRedis } from './redis';

/**
 * The hint that travels through Redis pub/sub: "there is something new for you", by ids only. It never carries anyone's words.
 * The WebSocket process, on receiving it, asks the module (with a fresh authorisation check) what — if anything — this person
 * may be shown, so a person who was blocked after their socket opened stops receiving at once, and Redis is never a place where
 * message content sits.
 */
const hintSchema = z.object({
  kind: z.literal('whisper'),
  conversationId: z.string().uuid(),
  seq: z.number().int().positive(),
});
export type RealtimeHint = z.infer<typeof hintSchema>;

export const userChannel = (userId: string): string => `rt:user:${userId}`;

/** Ask a person's open sockets (on any server process) to look for something new. Best-effort: failure is logged, not thrown. */
export async function publishToUser(userId: string, hint: RealtimeHint): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.publish(userChannel(userId), JSON.stringify(hint));
  } catch (err) {
    logger.warn({ event: 'realtime.publish_failed', err });
  }
}

/** Read a hint off the wire. Anything that is not exactly a hint is ignored. */
export function parseHint(raw: string): RealtimeHint | null {
  try {
    const parsed = hintSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
