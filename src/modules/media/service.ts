import { randomUUID } from 'node:crypto';
import { media } from '@db/schema';
import { and, count, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { logger } from '@/platform/logger';
import { photoChecker } from '@/platform/photo-check';
import { enforceRateLimit } from '@/platform/rate-limit';
import { getObjectStore, type UploadTarget } from '@/platform/storage';
import { PORTRAIT_MAX_BYTES, type PortraitType } from '@/shared/validation/media';
import { previewForCheck, processCardPhoto, processPortrait } from './image';

const rule = (limit: number, windowSec: number) => ({ limit, windowSec });
export const RATE = {
  /** Asking for an upload URL. Each one can lead to a stored file, so this is the cost limit. */
  start: rule(10, 3600),
  /** Finishing an upload (decoding an image is the expensive step). */
  complete: rule(20, 3600),
} as const;

/** A pending upload that was never finished is thrown away after this long. */
export const PENDING_TTL_MINUTES = 60;

/** The most bytes we ever read back for a stored Portrait (it is ~30 KB; this is a safety stop, not a target). */
const SERVE_MAX_BYTES = 2 * 1024 * 1024;

const log = logger.child({ module: 'media' });
const store = () => getObjectStore();

/** Postgres unique-violation (also unwraps Drizzle's wrapper). */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 4; depth++) {
    const o = e as { code?: string; cause?: unknown };
    if (o.code === '23505') return true;
    e = o.cause;
  }
  return false;
}

type Status = 'pending' | 'ready' | 'retired';

/**
 * Remove a file: the OBJECT first, then the row (an interrupted job then still has the row to find it again). Never throws:
 * a storage hiccup must not break the request that triggered it; the row stays and the retention job retries.
 *
 * The row is deleted only while it still has one of `statuses` (by default: not a live Portrait). That guard matters: between
 * reading a row and deleting it, another request may have made it the person's live Portrait, and a stale "clean-up" must never
 * take that away.
 */
async function destroy(
  rows: { id: string; objectKey: string }[],
  statuses: Status[] = ['pending', 'retired'],
): Promise<number> {
  let done = 0;
  for (const row of rows) {
    try {
      await store().delete(row.objectKey);
      await getDb()
        .delete(media)
        .where(and(eq(media.id, row.id), inArray(media.status, statuses)));
      done++;
    } catch (cause) {
      log.warn({ event: 'media.delete_failed', mediaId: row.id, cause: String(cause) });
    }
  }
  return done;
}

/** Who is looking at a photo. A held one (ADR-039) is shown only to its owner and to moderators. */
export type PhotoViewer = { userId: string | null } | 'moderator';
const shownTo = (viewer: PhotoViewer) =>
  viewer === 'moderator'
    ? undefined
    : viewer.userId
      ? or(eq(media.held, false), eq(media.ownerId, viewer.userId))
      : eq(media.held, false);

const REFUSED = 'We can’t use that photo on Howdy. Please choose a different one.';

/**
 * The photo check (ADR-039) on the photo we are about to store. Null when the check is not set up. It sees only our
 * re-encoded pixels, never the upload itself.
 */
async function checkPhoto(processed: Buffer) {
  const check = photoChecker();
  if (!check) return null;
  const verdict = await check(await previewForCheck(processed));
  if (verdict.verdict !== 'ok') log.info({ event: 'photo_check.' + verdict.verdict });
  return verdict;
}

export interface StartedUpload {
  mediaId: string;
  upload: UploadTarget;
}

/**
 * Step 1 of a new Portrait: reserve an id and hand back a signed URL for exactly this type and size. Nothing is trusted yet.
 * A person has at most one unfinished upload: asking again discards the previous one.
 */
export async function startPortraitUpload(
  userId: string,
  file: { contentType: PortraitType; size: number },
): Promise<StartedUpload> {
  await enforceRateLimit(`media:start:${userId}`, RATE.start);
  if (file.size > PORTRAIT_MAX_BYTES) throw new AppError('VALIDATION_FAILED');

  const db = getDb();
  const stale = await db
    .select({ id: media.id, objectKey: media.objectKey })
    .from(media)
    .where(and(eq(media.ownerId, userId), eq(media.status, 'pending'), eq(media.kind, 'portrait')));
  await destroy(stale);

  // A random key: it says nothing about who owns the file.
  const objectKey = `incoming/${randomUUID()}`;
  const [row] = await db
    .insert(media)
    .values({ ownerId: userId, kind: 'portrait', status: 'pending', objectKey })
    .returning({ id: media.id });
  const upload = await store().createUpload(objectKey, file);
  return { mediaId: row!.id, upload };
}

/**
 * Step 2: the browser says it has sent the file. Read it back, decode it, crop it, re-encode it, and only then make it the
 * person's Portrait (replacing any earlier one). The uploaded original is deleted either way.
 */
export async function completePortrait(userId: string, mediaId: string): Promise<{ version: string }> {
  await enforceRateLimit(`media:complete:${userId}`, RATE.complete);

  const db = getDb();
  // Someone else's id, a finished one and a missing one are all the same answer.
  const [pending] = await db
    .select({ id: media.id, objectKey: media.objectKey })
    .from(media)
    .where(
      and(
        eq(media.id, mediaId),
        eq(media.ownerId, userId),
        eq(media.kind, 'portrait'),
        eq(media.status, 'pending'),
      ),
    )
    .limit(1);
  if (!pending) throw new AppError('NOT_FOUND');

  const reject = async (message: string): Promise<never> => {
    // If another request has already finished this same upload, there is nothing to reject: it simply is not pending any more.
    const [now] = await db
      .select({ status: media.status })
      .from(media)
      .where(eq(media.id, pending.id))
      .limit(1);
    if (now?.status !== 'pending') throw new AppError('NOT_FOUND');
    await destroy([pending]);
    throw new AppError('VALIDATION_FAILED', { message, fields: { file: message } });
  };

  const size = await store().size(pending.objectKey);
  if (size === null) return reject('We did not receive your photo. Please try again.');
  if (size > PORTRAIT_MAX_BYTES) return reject('Photos can be at most 5 MB.');

  const original = await store().get(pending.objectKey, PORTRAIT_MAX_BYTES);
  if (!original) return reject('We did not receive your photo. Please try again.');

  let processed;
  try {
    processed = await processPortrait(original);
  } catch (err) {
    await destroy([pending]);
    throw err;
  }
  const check = await checkPhoto(processed.data);
  if (check?.verdict === 'refuse') return reject(REFUSED);
  const held = check?.verdict === 'hold';

  const finalKey = `portraits/${randomUUID()}.webp`;
  await store().put(finalKey, processed.data, 'image/webp');

  let retired: { id: string; objectKey: string }[] = [];
  try {
    retired = await db.transaction(async (tx) => {
      // The old Portrait steps aside and the new one becomes the only live one, in one step.
      const old = await tx
        .update(media)
        .set({ status: 'retired', updatedAt: sql`now()` })
        .where(and(eq(media.ownerId, userId), eq(media.kind, 'portrait'), eq(media.status, 'ready')))
        .returning({ id: media.id, objectKey: media.objectKey });
      const promoted = await tx
        .update(media)
        .set({
          status: 'ready',
          objectKey: finalKey,
          contentType: 'image/webp',
          byteSize: processed.data.length,
          width: processed.width,
          height: processed.height,
          held,
          updatedAt: sql`now()`,
        })
        .where(and(eq(media.id, pending.id), eq(media.status, 'pending')))
        .returning({ id: media.id });
      if (promoted.length === 0) throw new AppError('NOT_FOUND'); // finished by another request meanwhile
      // The raw upload is now an orphan. Give it a row of its own, marked for deletion, in the SAME step: if removing the file
      // fails below, the retention job still knows about it (a file with no row could never be found again).
      const [raw] = await tx
        .insert(media)
        .values({ ownerId: userId, kind: 'portrait', status: 'retired', objectKey: pending.objectKey })
        .returning({ id: media.id, objectKey: media.objectKey });
      return [...old, raw!];
    });
  } catch (err) {
    await store()
      .delete(finalKey)
      .catch(() => undefined);
    if (isUniqueViolation(err)) throw new AppError('CONFLICT', { message: 'Please try that again.' });
    throw err;
  }

  // Clean up after the fact: the raw upload and the Portrait that was replaced (each: object first, then its row).
  await destroy(retired);
  if (check?.verdict === 'hold') {
    emit({
      type: 'photo.held',
      mediaId: pending.id,
      ownerId: userId,
      kind: 'portrait',
      summary: check.summary,
    });
  }
  return { version: pending.id };
}

// --- Post Card photos (ADR-031) ---------------------------------------------------------------------------------------

/** Card photos waiting to be nailed are thrown away after this long (the same as an unfinished upload). */
export const UNATTACHED_TTL_MINUTES = 60;

/**
 * Step 1 of a card photo: reserve an id and a signed upload URL. One unfinished card photo at a time: asking again
 * discards the previous one (a Porch photo upload is left alone).
 */
export async function startCardPhotoUpload(
  userId: string,
  file: { contentType: PortraitType; size: number },
): Promise<StartedUpload> {
  await enforceRateLimit(`media:start:${userId}`, RATE.start);
  if (file.size > PORTRAIT_MAX_BYTES) throw new AppError('VALIDATION_FAILED');
  const db = getDb();
  const stale = await db
    .select({ id: media.id, objectKey: media.objectKey })
    .from(media)
    .where(and(eq(media.ownerId, userId), eq(media.status, 'pending'), eq(media.kind, 'card_photo')));
  await destroy(stale);
  const objectKey = `incoming/${randomUUID()}`;
  const [row] = await db
    .insert(media)
    .values({ ownerId: userId, kind: 'card_photo', status: 'pending', objectKey })
    .returning({ id: media.id });
  const upload = await store().createUpload(objectKey, file);
  return { mediaId: row!.id, upload };
}

/**
 * Step 2: read the upload back, decode and re-encode it, and keep the result ready to be nailed (on no card yet). The
 * uploaded original is deleted either way. Someone else's id, a finished one and a missing one are the same 404.
 */
export async function completeCardPhoto(
  userId: string,
  mediaId: string,
): Promise<{ mediaId: string; width: number; height: number }> {
  await enforceRateLimit(`media:complete:${userId}`, RATE.complete);
  const db = getDb();
  const [pending] = await db
    .select({ id: media.id, objectKey: media.objectKey })
    .from(media)
    .where(
      and(
        eq(media.id, mediaId),
        eq(media.ownerId, userId),
        eq(media.kind, 'card_photo'),
        eq(media.status, 'pending'),
      ),
    )
    .limit(1);
  if (!pending) throw new AppError('NOT_FOUND');
  const reject = async (message: string): Promise<never> => {
    await destroy([pending]);
    throw new AppError('VALIDATION_FAILED', { message, fields: { file: message } });
  };
  const size = await store().size(pending.objectKey);
  if (size === null) return reject('We did not receive your photo. Please try again.');
  if (size > PORTRAIT_MAX_BYTES) return reject('Photos can be at most 5 MB.');
  const original = await store().get(pending.objectKey, PORTRAIT_MAX_BYTES);
  if (!original) return reject('We did not receive your photo. Please try again.');
  let processed;
  try {
    processed = await processCardPhoto(original);
  } catch (err) {
    await destroy([pending]);
    throw err;
  }
  const check = await checkPhoto(processed.data);
  if (check?.verdict === 'refuse') return reject(REFUSED);
  const held = check?.verdict === 'hold';
  const finalKey = `cards/${randomUUID()}.webp`;
  await store().put(finalKey, processed.data, 'image/webp');
  let raw: { id: string; objectKey: string };
  try {
    raw = await db.transaction(async (tx) => {
      const promoted = await tx
        .update(media)
        .set({
          status: 'ready',
          objectKey: finalKey,
          contentType: 'image/webp',
          byteSize: processed.data.length,
          width: processed.width,
          height: processed.height,
          held,
          updatedAt: sql`now()`,
        })
        .where(and(eq(media.id, pending.id), eq(media.status, 'pending')))
        .returning({ id: media.id });
      if (promoted.length === 0) throw new AppError('NOT_FOUND');
      // The raw upload gets a row of its own, marked for deletion, in the same step (see completePortrait).
      const [r] = await tx
        .insert(media)
        .values({ ownerId: userId, kind: 'card_photo', status: 'retired', objectKey: pending.objectKey })
        .returning({ id: media.id, objectKey: media.objectKey });
      return r!;
    });
  } catch (err) {
    await store()
      .delete(finalKey)
      .catch(() => undefined);
    throw err;
  }
  await destroy([raw]);
  if (check?.verdict === 'hold') {
    emit({
      type: 'photo.held',
      mediaId: pending.id,
      ownerId: userId,
      kind: 'card_photo',
      summary: check.summary,
    });
  }
  return { mediaId: pending.id, width: processed.width, height: processed.height };
}

/**
 * The bytes of a card photo. This does NOT decide who may look: the caller has already applied the card's own rules
 * (fence.cardPhotoFor) and passes the id it got from there.
 */
export async function readCardPhoto(mediaId: string, viewer: PhotoViewer): Promise<Buffer | null> {
  const [row] = await getDb()
    .select({ objectKey: media.objectKey })
    .from(media)
    .where(
      and(eq(media.id, mediaId), eq(media.kind, 'card_photo'), eq(media.status, 'ready'), shownTo(viewer)),
    )
    .limit(1);
  if (!row) return null;
  return store().get(row.objectKey, SERVE_MAX_BYTES);
}

/**
 * Throw away card photos that are on no card and in no Town Hall post (ADR-046): never used within the hour, or whose
 * card or post has been removed (its pointer went to null). Object first, then row. Safe to call right after a card or
 * a post is removed, and daily.
 */
export async function purgeDetachedCardPhotos(
  now: Date = new Date(),
): Promise<{ cardPhotosRemoved: number }> {
  const cutoff = new Date(now.getTime() - UNATTACHED_TTL_MINUTES * 60_000);
  const rows = await getDb()
    .select({ id: media.id, objectKey: media.objectKey })
    .from(media)
    .where(
      and(
        eq(media.kind, 'card_photo'),
        eq(media.status, 'ready'),
        isNull(media.cardId),
        isNull(media.hallPostId),
        lt(media.createdAt, cutoff),
      ),
    );
  return { cardPhotosRemoved: await destroy(rows, ['ready']) };
}

/** Remove my Portrait (the initials avatar comes back). Returns whether there was one. */
export async function removePortrait(userId: string): Promise<boolean> {
  const retired = await getDb()
    .update(media)
    .set({ status: 'retired', updatedAt: sql`now()` })
    .where(and(eq(media.ownerId, userId), eq(media.kind, 'portrait'), eq(media.status, 'ready')))
    .returning({ id: media.id, objectKey: media.objectKey });
  await destroy(retired);
  return retired.length > 0;
}

/**
 * Retire one exact Portrait (a moderator removing a reported photo, ADR-025). Only that version, only while it is live:
 * a photo the owner has since replaced is left alone and this answers false.
 */
export async function retirePortrait(ownerId: string, mediaId: string): Promise<boolean> {
  const retired = await getDb()
    .update(media)
    .set({ status: 'retired', updatedAt: sql`now()` })
    .where(
      and(
        eq(media.id, mediaId),
        eq(media.ownerId, ownerId),
        eq(media.kind, 'portrait'),
        eq(media.status, 'ready'),
      ),
    )
    .returning({ id: media.id, objectKey: media.objectKey });
  await destroy(retired);
  return retired.length > 0;
}

/** Take down one exact card photo (a moderator, ADR-039): the card stays, without its photo. Only while it is live. */
export async function retireCardPhoto(ownerId: string, mediaId: string): Promise<boolean> {
  const retired = await getDb()
    .update(media)
    .set({ status: 'retired', updatedAt: sql`now()` })
    .where(
      and(
        eq(media.id, mediaId),
        eq(media.ownerId, ownerId),
        eq(media.kind, 'card_photo'),
        eq(media.status, 'ready'),
      ),
    )
    .returning({ id: media.id, objectKey: media.objectKey });
  await destroy(retired);
  return retired.length > 0;
}

/** A moderator found a held photo fine (ADR-039): everyone who may see it now can. Whether it was held. */
export async function releaseHeldPhoto(mediaId: string): Promise<boolean> {
  const rows = await getDb()
    .update(media)
    .set({ held: false, updatedAt: sql`now()` })
    .where(and(eq(media.id, mediaId), eq(media.held, true)))
    .returning({ id: media.id });
  return rows.length > 0;
}

/** The id of someone's live Portrait (used to name the picture in a URL and to bust caches), or null when they have none. */
export async function getPortraitVersion(userId: string, viewer: PhotoViewer): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: media.id })
    .from(media)
    .where(
      and(eq(media.ownerId, userId), eq(media.kind, 'portrait'), eq(media.status, 'ready'), shownTo(viewer)),
    )
    .limit(1);
  return row?.id ?? null;
}

/** `getPortraitVersion` for many people in one query: only those with a live Portrait appear in the map. */
export async function getPortraitVersions(
  userIds: string[],
  viewer: PhotoViewer,
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ ownerId: media.ownerId, id: media.id })
    .from(media)
    .where(
      and(
        inArray(media.ownerId, [...new Set(userIds)]),
        eq(media.kind, 'portrait'),
        eq(media.status, 'ready'),
        shownTo(viewer),
      ),
    );
  return new Map(rows.map((r) => [r.ownerId, r.id]));
}

/**
 * The bytes of someone's live Portrait. This does NOT decide who may look: the caller (the route) has already applied the
 * visibility rules. A row whose file has gone missing reads as "no Portrait".
 */
export async function readPortrait(
  ownerId: string,
  viewer: PhotoViewer,
): Promise<{ bytes: Buffer; version: string } | null> {
  const [row] = await getDb()
    .select({ id: media.id, objectKey: media.objectKey })
    .from(media)
    .where(
      and(eq(media.ownerId, ownerId), eq(media.kind, 'portrait'), eq(media.status, 'ready'), shownTo(viewer)),
    )
    .limit(1);
  if (!row) return null;
  const bytes = await store().get(row.objectKey, SERVE_MAX_BYTES);
  return bytes ? { bytes, version: row.id } : null;
}

/** How many file rows a person still has (account deletion must see 0 before it deletes the account, ADR-027). */
export async function mediaLeftFor(userId: string): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(media).where(eq(media.ownerId, userId));
  return row?.n ?? 0;
}

/** Remove every file a person owns, objects first. What an account deletion has to call before the person's rows go. */
export async function deleteAllMediaFor(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: media.id, objectKey: media.objectKey })
    .from(media)
    .where(eq(media.ownerId, userId));
  return destroy(rows, ['pending', 'ready', 'retired']);
}

/**
 * Retention job: throw away uploads nobody finished and finish deleting anything that was replaced or removed but not fully
 * cleaned up (a storage error the first time). Safe to run repeatedly.
 */
export async function purgeStaleMedia(
  now: Date = new Date(),
): Promise<{ mediaPending: number; mediaRetired: number }> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - PENDING_TTL_MINUTES * 60_000);
  const pending = await db
    .select({ id: media.id, objectKey: media.objectKey })
    .from(media)
    .where(and(eq(media.status, 'pending'), lt(media.createdAt, cutoff)));
  const retired = await db
    .select({ id: media.id, objectKey: media.objectKey })
    .from(media)
    .where(inArray(media.status, ['retired']));
  return { mediaPending: await destroy(pending), mediaRetired: await destroy(retired) };
}
