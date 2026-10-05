import { conversations, messages } from '@db/schema';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { getCards } from '@/modules/profiles';
import { posseMembersAmong } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { pastCleared } from './service';

/**
 * The Whispers part of "Download my data" (ADR-037): exactly what the Whispers pages show me.
 *  - Threads: only with people I am still Pals with and whose account is active (as on the Whispers list), and in each
 *    only the Whispers I may see — my own (a Whisper held from its recipient looks sent to me, so it is just "sent"
 *    here too) and theirs that reached me. No read positions: "Seen" is not mine to export.
 *  - The held tray (ADR-026): Whispers kept back from me because I restricted their sender, from active accounts.
 * Whispers last 7 days, so this is at most a week of them.
 */

const THREAD_LIMIT = 100;
const MESSAGE_LIMIT = 5000;

export interface WhispersExport {
  threads: { otherId: string; whispers: { fromMe: boolean; body: string; sentAt: Date }[] }[];
  held: { fromId: string; body: string; sentAt: Date }[];
}

export async function whispersExport(userId: string): Promise<WhispersExport> {
  const db = getDb();
  const convs = await db
    .select({ id: conversations.id, userLow: conversations.userLow, userHigh: conversations.userHigh })
    .from(conversations)
    .where(or(eq(conversations.userLow, userId), eq(conversations.userHigh, userId)))
    .limit(THREAD_LIMIT);
  const otherOf = new Map(convs.map((c) => [c.id, c.userLow === userId ? c.userHigh : c.userLow]));
  const others = [...otherOf.values()];

  const [pals, cards, heldRows] = await Promise.all([
    posseMembersAmong(userId, others),
    getCards(others),
    db
      .select({ body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          eq(messages.status, 'held'),
          sql`${messages.senderId} <> ${userId}`,
          or(eq(conversations.userLow, userId), eq(conversations.userHigh, userId)),
          pastCleared(userId),
        ),
      )
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(MESSAGE_LIMIT),
  ]);
  const open = convs.filter((c) => {
    const other = otherOf.get(c.id)!;
    return pals.has(other) && cards.has(other);
  });

  const rows =
    open.length === 0
      ? []
      : await db
          .select({
            conversationId: messages.conversationId,
            senderId: messages.senderId,
            body: messages.body,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .innerJoin(conversations, eq(conversations.id, messages.conversationId))
          .where(
            and(
              inArray(
                messages.conversationId,
                open.map((c) => c.id),
              ),
              // Never words held back from me (the same rule as the thread page), nor any I burnt for myself (ADR-038).
              or(eq(messages.status, 'sent'), eq(messages.senderId, userId)),
              pastCleared(userId),
            ),
          )
          .orderBy(asc(messages.conversationId), asc(messages.seq))
          .limit(MESSAGE_LIMIT);

  const byThread = new Map<string, WhispersExport['threads'][number]['whispers']>();
  for (const m of rows) {
    const list = byThread.get(m.conversationId) ?? [];
    list.push({ fromMe: m.senderId === userId, body: m.body, sentAt: m.createdAt });
    byThread.set(m.conversationId, list);
  }
  const heldCards = await getCards([...new Set(heldRows.map((r) => r.senderId))]);

  return {
    threads: open.flatMap((c) => {
      const whispers = byThread.get(c.id);
      return whispers ? [{ otherId: otherOf.get(c.id)!, whispers }] : [];
    }),
    held: heldRows
      .filter((r) => heldCards.has(r.senderId))
      .map((r) => ({ fromId: r.senderId, body: r.body, sentAt: r.createdAt })),
  };
}
