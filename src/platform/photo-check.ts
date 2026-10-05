import { getEnv } from './config/env';
import { logger } from './logger';

/**
 * The photo check (ADR-039): before anyone else sees an uploaded photo, OpenAI's free moderation model looks at it.
 * Plain fetch, no SDK (the same choice as Resend and Ably). Unset OPENAI_API_KEY = no check.
 *
 * What the model can judge in a picture: sexual content, violence, graphic violence and self-harm. It CANNOT judge
 * "sexual/minors" from an image (that category is text-only) — no claim is made that it catches that.
 *
 *   refuse — near-certain explicit sexual content or graphic violence: the upload is turned down.
 *   hold   — anything else it flags, or the check could not be done: the photo goes up, seen only by its owner, and
 *            waits for a moderator.
 *   ok     — nothing flagged.
 */
export type PhotoVerdict = { verdict: 'ok' } | { verdict: 'hold' | 'refuse'; summary: string };

/** Above this score the photo is refused outright rather than held for a person to look at. */
export const REFUSE_AT = 0.9;
const REFUSE_CATEGORIES = ['sexual', 'violence/graphic'] as const;
const IMAGE_CATEGORIES = [
  'sexual',
  'violence',
  'violence/graphic',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
] as const;

const URL = 'https://api.openai.com/v1/moderations';
const TIMEOUT_MS = 8000;

export type PhotoChecker = (jpeg: Buffer) => Promise<PhotoVerdict>;
let override: PhotoChecker | null | undefined;

/** Tests: replace the checker (null = behave as if no key is set; undefined = back to the real one). */
export function setPhotoChecker(checker: PhotoChecker | null | undefined): void {
  override = checker;
}

/** The checker to use, or null when the photo check is not set up. */
export function photoChecker(): PhotoChecker | null {
  if (override !== undefined) return override;
  const key = getEnv().OPENAI_API_KEY;
  return key ? (jpeg) => checkWithOpenAI(key, jpeg) : null;
}

interface ModerationResult {
  flagged: boolean;
  category_scores: Record<string, number>;
}

/** Turn the model's scores into a verdict. Exported for unit tests. */
export function verdictFor(result: ModerationResult): PhotoVerdict {
  const scores = result.category_scores ?? {};
  const top = IMAGE_CATEGORIES.map((c) => [c, scores[c] ?? 0] as const)
    .filter(([, s]) => s >= 0.01)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c, s]) => `${c} ${s.toFixed(2)}`)
    .join(', ');
  const summary = `Photo check: ${top || 'flagged'}`;
  if (REFUSE_CATEGORIES.some((c) => (scores[c] ?? 0) >= REFUSE_AT)) return { verdict: 'refuse', summary };
  if (result.flagged) return { verdict: 'hold', summary };
  return { verdict: 'ok' };
}

async function checkWithOpenAI(key: string, jpeg: Buffer): Promise<PhotoVerdict> {
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` } },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ event: 'photo_check.failed', status: res.status });
      return { verdict: 'hold', summary: `Photo check could not run (${res.status}); held to be safe.` };
    }
    const data = (await res.json()) as { results?: ModerationResult[] };
    const result = data.results?.[0];
    if (!result) throw new Error('no result');
    return verdictFor(result);
  } catch (err) {
    logger.warn({ event: 'photo_check.failed', err });
    return { verdict: 'hold', summary: 'Photo check could not run; held to be safe.' };
  }
}
