import { randomUUID } from 'node:crypto';
import { media } from '@db/schema';
import { and, count, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { logger } from '@/platform/logger';
import { enforceRateLimit } from '@/platform/rate-limit';
import { getObjectStore, type UploadTarget } from '@/platform/storage';
import {
  VIDEO_LIFETIME_DAYS,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  VIDEO_LONG_SIDE_PX,
  VIDEO_SHORT_SIDE_PX,
  VIDEO_TYPE,
  VIDEOS_PER_DAY,
} from '@/shared/validation/media';
import { inspectMp4, type Mp4Problem } from './mp4';
import { destroy, FILE_COLUMNS, RATE, type PhotoViewer, type StartedUpload } from './service';

/**
 * Card videos (ADR-064). The phone has already converted the clip (H.264 + AAC, 720p, fast start); here the server only
 * checks what arrived, keeps it for 3 days, and hands out short-lived links to stream it straight from storage.
 *
 *   start     a pending row + a signed upload URL for exactly `size` bytes of video/mp4 (key `videos/<random>.mp4`)
 *   complete  size and MP4 header checked; the poster (a card photo the page sent first, already re-encoded and through
 *             the photo check) is folded into the video's row; ready, expires in 3 days
 *   post      fence.postCard attaches it to a card (friends-only walls)
 *   watch     after the card's own rules, a signed GET URL that works for 10 minutes
 *   expire    the job deletes both files and marks the row `expired` (the post says so); a bucket lifecycle rule on
 *             `videos/` deletes anything the job missed
 */

const log = logger.child({ module: 'media.video' });
const store = () => getObjectStore();

/** Asking to upload a video. Generous enough for a few failed tries; the real limit is VIDEOS_PER_DAY finished ones. */
const START_RULE = { limit: VIDEOS_PER_DAY * 3, windowSec: 24 * 3600 } as const;
/** How much of the file we read to find the MP4 index. A 30 s clip's index is well under 200 KB. */
const HEAD_BYTES = 1024 * 1024;
/** How long a link to watch works. A 30 s clip is long finished by then; the player asks again if it ever runs out. */
export const WATCH_LINK_SEC = 600;
/** The poster is a small WebP; this is a safety stop. */
const POSTER_MAX_BYTES = 2 * 1024 * 1024;
const LIFETIME_MS = VIDEO_LIFETIME_DAYS * 24 * 3600 * 1000;

const LIMITS = {
  maxSeconds: VIDEO_MAX_SECONDS,
  // The phone fits the picture inside 720 × 1280; encoders may round up to a multiple of 16.
  maxShortSide: VIDEO_SHORT_SIDE_PX + 16,
  maxLongSide: VIDEO_LONG_SIDE_PX + 32,
};

/** What the writer is told, per problem. Calm and specific; none of it blames them. */
const PROBLEM: Record<Mp4Problem, string> = {
  not_mp4: 'That video could not be read. Please choose it again.',
  not_fast_start: 'That video was not prepared properly. Please choose it again.',
  wrong_codec: 'That video was not prepared properly. Please choose it again.',
  too_long: `Videos can be at most ${VIDEO_MAX_SECONDS} seconds.`,
  too_large: 'That video was not shrunk properly. Please choose it again.',
};

/** Step 1: reserve an id and a signed URL. One unfinished video at a time: asking again discards the previous one. */
export async function startCardVideoUpload(
  userId: string,
  file: { contentType: typeof VIDEO_TYPE; size: number },
): Promise<StartedUpload> {
  await enforceRateLimit(`media:video:start:${userId}`, START_RULE);
  if (file.size > VIDEO_MAX_BYTES || file.contentType !== VIDEO_TYPE) throw new AppError('VALIDATION_FAILED');
  const db = getDb();
  const stale = await db
    .select(FILE_COLUMNS)
    .from(media)
    .where(and(eq(media.ownerId, userId), eq(media.status, 'pending'), eq(media.kind, 'card_video')));
  await destroy(stale);
  // Stored where it will stay (there is no re-encoding step to move it), under the prefix the bucket's 3-day rule covers.
  const objectKey = `videos/${randomUUID()}.mp4`;
  const [row] = await db
    .insert(media)
    .values({ ownerId: userId, kind: 'card_video', status: 'pending', objectKey })
    .returning({ id: media.id });
  const upload: UploadTarget = await store().createUpload(objectKey, file);
  return { mediaId: row!.id, upload };
}

/** Finished videos a person posted (or got ready) in the last 24 hours. */
async function videosToday(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(media)
    .where(
      and(
        eq(media.ownerId, userId),
        eq(media.kind, 'card_video'),
        inArray(media.status, ['ready', 'expired']),
        // Finished = expires 3 days later; finished within 24 hours = expires more than 2 days from now.
        gt(media.expiresAt, new Date(Date.now() + LIFETIME_MS - 24 * 3600 * 1000)),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Step 2: the browser says the video (and, before it, the poster photo) is there. Check the video's size and header;
 * take over the poster; make it ready to post for 3 days. Anything wrong deletes the upload and says why.
 */
export async function completeCardVideo(
  userId: string,
  mediaId: string,
  posterId: string,
): Promise<{ mediaId: string; width: number; height: number; durationMs: number }> {
  await enforceRateLimit(`media:complete:${userId}`, RATE.complete);
  const db = getDb();
  const [pending] = await db
    .select(FILE_COLUMNS)
    .from(media)
    .where(
      and(
        eq(media.id, mediaId),
        eq(media.ownerId, userId),
        eq(media.kind, 'card_video'),
        eq(media.status, 'pending'),
      ),
    )
    .limit(1);
  if (!pending) throw new AppError('NOT_FOUND');
  const reject = async (message: string): Promise<never> => {
    await destroy([pending]);
    throw new AppError('VALIDATION_FAILED', { message, fields: { file: message } });
  };

  if ((await videosToday(userId)) >= VIDEOS_PER_DAY)
    return reject(`You can post ${VIDEOS_PER_DAY} videos a day. Try again tomorrow.`);

  const size = await store().size(pending.objectKey);
  if (size === null || size === 0) return reject('We did not receive your video. Please try again.');
  if (size > VIDEO_MAX_BYTES) return reject('That video is too big. Try a shorter clip.');
  const head = await store().getHead(pending.objectKey, HEAD_BYTES);
  if (!head) return reject('We did not receive your video. Please try again.');
  const verdict = inspectMp4(head, size, LIMITS);
  if (!verdict.ok) {
    log.info({
      event: 'video.refused',
      reason: verdict.reason,
      ...(verdict.size ? { size: verdict.size } : {}),
    });
    return reject(PROBLEM[verdict.reason]);
  }

  // The poster: my own card photo, finished and on nothing yet. It has been re-encoded and through the photo check.
  const [poster] = await db
    .select({ id: media.id, objectKey: media.objectKey, held: media.held })
    .from(media)
    .where(
      and(
        eq(media.id, posterId),
        eq(media.ownerId, userId),
        eq(media.kind, 'card_photo'),
        eq(media.status, 'ready'),
        isNull(media.cardId),
        isNull(media.hallPostId),
        isNull(media.storyId),
      ),
    )
    .limit(1);
  if (!poster) return reject('We lost the video’s preview. Please choose the video again.');
  // A frame the photo check would hold is not posted: a held video would wait for a review it may never get in 3 days.
  if (poster.held)
    return reject('We can’t use that video. Please try a different one, or try again in a few minutes.');

  await db.transaction(async (tx) => {
    // The poster's row goes; its file now belongs to the video (deleted with it).
    const taken = await tx
      .delete(media)
      .where(and(eq(media.id, poster.id), eq(media.status, 'ready'), isNull(media.cardId)))
      .returning({ id: media.id });
    if (taken.length === 0) throw new AppError('NOT_FOUND');
    const promoted = await tx
      .update(media)
      .set({
        status: 'ready',
        contentType: VIDEO_TYPE,
        byteSize: size,
        width: verdict.width,
        height: verdict.height,
        durationMs: verdict.durationMs,
        posterKey: poster.objectKey,
        expiresAt: new Date(Date.now() + LIFETIME_MS),
        updatedAt: sql`now()`,
      })
      .where(and(eq(media.id, pending.id), eq(media.status, 'pending')))
      .returning({ id: media.id });
    if (promoted.length === 0) throw new AppError('NOT_FOUND');
  });
  return {
    mediaId: pending.id,
    width: verdict.width,
    height: verdict.height,
    durationMs: verdict.durationMs,
  };
}

const notExpired = () => gt(media.expiresAt, new Date());
const shownTo = (viewer: PhotoViewer) =>
  viewer === 'moderator'
    ? undefined
    : viewer.userId
      ? sql`(${media.held} = false or ${media.ownerId} = ${viewer.userId})`
      : eq(media.held, false);

/**
 * A link to watch a card video, valid for WATCH_LINK_SEC. This does NOT decide who may look: the caller has already
 * applied the card's rules (fence.cardVideoFor) and passes the id it got from there.
 */
export async function cardVideoLink(mediaId: string, viewer: PhotoViewer): Promise<string | null> {
  const [row] = await getDb()
    .select({ objectKey: media.objectKey })
    .from(media)
    .where(
      and(
        eq(media.id, mediaId),
        eq(media.kind, 'card_video'),
        eq(media.status, 'ready'),
        notExpired(),
        shownTo(viewer),
      ),
    )
    .limit(1);
  if (!row) return null;
  return store().createDownload(row.objectKey, { contentType: VIDEO_TYPE, ttlSec: WATCH_LINK_SEC });
}

/** The poster's bytes (a small WebP), under the same conditions as cardVideoLink. */
export async function readCardVideoPoster(mediaId: string, viewer: PhotoViewer): Promise<Buffer | null> {
  const [row] = await getDb()
    .select({ posterKey: media.posterKey })
    .from(media)
    .where(
      and(
        eq(media.id, mediaId),
        eq(media.kind, 'card_video'),
        eq(media.status, 'ready'),
        notExpired(),
        shownTo(viewer),
      ),
    )
    .limit(1);
  if (!row?.posterKey) return null;
  return store().get(row.posterKey, POSTER_MAX_BYTES);
}

/**
 * Someone reported the card (ADR-064): its video is hidden from everyone but its writer at once, until a moderator
 * decides. Dismissing the report shows it again (releaseCardVideo); removing the card removes it.
 */
export async function holdCardVideo(cardId: string): Promise<boolean> {
  const rows = await getDb()
    .update(media)
    .set({ held: true, updatedAt: sql`now()` })
    .where(and(eq(media.cardId, cardId), eq(media.kind, 'card_video'), eq(media.held, false)))
    .returning({ id: media.id });
  return rows.length > 0;
}

export async function releaseCardVideo(cardId: string): Promise<boolean> {
  const rows = await getDb()
    .update(media)
    .set({ held: false, updatedAt: sql`now()` })
    .where(and(eq(media.cardId, cardId), eq(media.kind, 'card_video'), eq(media.held, true)))
    .returning({ id: media.id });
  return rows.length > 0;
}

/**
 * Retention job: videos past their 3 days lose both files and become `expired` (the row stays with its card so the post
 * can say so; it goes when the card does). A file that will not delete is left `ready` for the next run; it is never
 * served meanwhile (every read checks `expires_at`). Safe to run repeatedly.
 */
export async function expireCardVideos(now: Date = new Date()): Promise<{ videosExpired: number }> {
  const db = getDb();
  const rows = await db
    .select(FILE_COLUMNS)
    .from(media)
    .where(and(eq(media.kind, 'card_video'), eq(media.status, 'ready'), lte(media.expiresAt, now)));
  let done = 0;
  for (const row of rows) {
    try {
      await store().delete(row.objectKey);
      if (row.posterKey) await store().delete(row.posterKey);
      await db
        .update(media)
        .set({ status: 'expired', posterKey: null, updatedAt: sql`now()` })
        .where(and(eq(media.id, row.id), eq(media.status, 'ready')));
      done++;
    } catch (cause) {
      log.warn({ event: 'video.expire_failed', mediaId: row.id, cause: String(cause) });
    }
  }
  return { videosExpired: done };
}
