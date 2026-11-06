/** The photo check's categories (src/platform/photo-check.ts), in everyday words. */
const CHECK_CATEGORY: Record<string, string> = {
  sexual: 'sexual content',
  violence: 'violence',
  'violence/graphic': 'graphic violence',
  'self-harm': 'self-harm',
  'self-harm/intent': 'self-harm',
  'self-harm/instructions': 'self-harm',
};

/**
 * What the photo check wrote on its report ("Photo check: violence 0.62, sexual 0.10", or "Photo check could not run
 * (401); held to be safe."), read back as either "the check was down" or the things it thought it saw, most likely first.
 */
export function readPhotoCheck(details: string | null): { down: boolean; saw: string[] } {
  if (!details || /could not run/i.test(details)) return { down: true, saw: [] };
  const saw: string[] = [];
  for (const m of details.matchAll(/([a-z/-]+) (\d(?:\.\d+)?)/g)) {
    const label = CHECK_CATEGORY[m[1]!];
    const pct = Math.round(Number(m[2]) * 100);
    const text = label && `${label} (${pct}% sure)`;
    if (text && !saw.some((s) => s.startsWith(label))) saw.push(text);
  }
  return { down: false, saw };
}
