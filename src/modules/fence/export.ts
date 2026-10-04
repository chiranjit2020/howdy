import { cardReplies, media, postCards, yos } from '@db/schema';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { getDb } from '@/platform/db';

/**
 * The Fence part of "Download my data" (ADR-037), as raw rows with user ids: the app layer names people and leaves out
 * anyone the person cannot see now. Every state here is the one the app already shows the person:
 *  - on MY Fence I am the owner, so everything waiting for me (pending or held) is "waiting";
 *  - on someone else's Fence I am the writer, so only an honest wait (Review on) is "waiting" — a card or reply HELD
 *    because the owner restricted me looks posted to me in the app, and looks posted here (ADR-011).
 */

/** Plenty for a real person; bounds one export however much someone has written. */
export const EXPORT_CAP = 5000;

export type ExportState = 'published' | 'waiting';

export interface FenceExport {
  onMyFence: {
    id: string;
    authorId: string;
    body: string;
    state: ExportState;
    createdAt: Date;
    photoId: string | null;
    replies: { authorId: string; body: string; state: ExportState; createdAt: Date }[];
  }[];
  myCardsElsewhere: {
    id: string;
    fenceOwnerId: string;
    body: string;
    state: ExportState;
    createdAt: Date;
    photoId: string | null;
  }[];
  myRepliesElsewhere: {
    fenceOwnerId: string;
    cardAuthorId: string;
    body: string;
    state: ExportState;
    createdAt: Date;
  }[];
  myReactions: { fenceOwnerId: string; cardAuthorId: string; kind: string; createdAt: Date }[];
}

const asOwnerSees = (status: string): ExportState => (status === 'published' ? 'published' : 'waiting');
const asWriterSees = (status: string): ExportState => (status === 'pending' ? 'waiting' : 'published');

export async function fenceExport(userId: string): Promise<FenceExport> {
  const db = getDb();
  const [mine, elsewhere, myReplies, myYos] = await Promise.all([
    db
      .select()
      .from(postCards)
      .where(eq(postCards.fenceOwnerId, userId))
      .orderBy(asc(postCards.createdAt), asc(postCards.id))
      .limit(EXPORT_CAP),
    db
      .select()
      .from(postCards)
      .where(and(eq(postCards.authorId, userId), ne(postCards.fenceOwnerId, userId)))
      .orderBy(asc(postCards.createdAt), asc(postCards.id))
      .limit(EXPORT_CAP),
    db
      .select({
        body: cardReplies.body,
        status: cardReplies.status,
        createdAt: cardReplies.createdAt,
        fenceOwnerId: postCards.fenceOwnerId,
        cardAuthorId: postCards.authorId,
      })
      .from(cardReplies)
      .innerJoin(postCards, eq(postCards.id, cardReplies.cardId))
      .where(and(eq(cardReplies.authorId, userId), ne(postCards.fenceOwnerId, userId)))
      .orderBy(asc(cardReplies.createdAt), asc(cardReplies.id))
      .limit(EXPORT_CAP),
    db
      .select({
        kind: yos.kind,
        createdAt: yos.createdAt,
        fenceOwnerId: postCards.fenceOwnerId,
        cardAuthorId: postCards.authorId,
      })
      .from(yos)
      .innerJoin(postCards, eq(postCards.id, yos.cardId))
      .where(eq(yos.userId, userId))
      .orderBy(asc(yos.createdAt))
      .limit(EXPORT_CAP),
  ]);

  const cardIds = [...mine.map((c) => c.id), ...elsewhere.map((c) => c.id)];
  const [repliesOnMine, photos] = await Promise.all([
    mine.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(cardReplies)
          .where(
            inArray(
              cardReplies.cardId,
              mine.map((c) => c.id),
            ),
          )
          .orderBy(asc(cardReplies.createdAt), asc(cardReplies.id)),
    cardIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: media.id, cardId: media.cardId })
          .from(media)
          .where(
            and(inArray(media.cardId, cardIds), eq(media.kind, 'card_photo'), eq(media.status, 'ready')),
          ),
  ]);
  const photoOf = new Map(photos.map((p) => [p.cardId!, p.id]));
  const repliesOf = new Map<string, FenceExport['onMyFence'][number]['replies']>();
  for (const r of repliesOnMine) {
    const list = repliesOf.get(r.cardId) ?? [];
    list.push({
      authorId: r.authorId,
      body: r.body,
      // My own replies on my own Fence are never held; anyone else's wait for me, whatever the reason.
      state: asOwnerSees(r.status),
      createdAt: r.createdAt,
    });
    repliesOf.set(r.cardId, list);
  }

  return {
    onMyFence: mine.map((c) => ({
      id: c.id,
      authorId: c.authorId,
      body: c.body,
      state: asOwnerSees(c.status),
      createdAt: c.createdAt,
      photoId: photoOf.get(c.id) ?? null,
      replies: repliesOf.get(c.id) ?? [],
    })),
    myCardsElsewhere: elsewhere.map((c) => ({
      id: c.id,
      fenceOwnerId: c.fenceOwnerId,
      body: c.body,
      state: asWriterSees(c.status),
      createdAt: c.createdAt,
      photoId: photoOf.get(c.id) ?? null,
    })),
    myRepliesElsewhere: myReplies.map((r) => ({
      fenceOwnerId: r.fenceOwnerId,
      cardAuthorId: r.cardAuthorId,
      body: r.body,
      state: asWriterSees(r.status),
      createdAt: r.createdAt,
    })),
    myReactions: myYos.map((y) => ({
      fenceOwnerId: y.fenceOwnerId,
      cardAuthorId: y.cardAuthorId,
      kind: y.kind,
      createdAt: y.createdAt,
    })),
  };
}
