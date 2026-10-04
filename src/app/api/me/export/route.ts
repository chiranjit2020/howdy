import { buildDataExport } from '@/app/_lib/data-export';
import { requireSession, verifyForExport } from '@/modules/auth';
import { readJson } from '@/platform/http/body';
import { route } from '@/platform/http/route';
import { zipStream } from '@/platform/zip';
import { exportDataSchema } from '@/shared/validation/auth';

export const dynamic = 'force-dynamic';
// Reading every photo out of storage can take a while for someone with many; the ZIP streams as it goes.
export const maxDuration = 60;

/**
 * "Download my data" (ADR-037): a ZIP of my data, built on the spot. A POST with my password (never a GET: a link or a
 * prefetch must not be able to start one). Everything that can fail — the password, the limits, reading the database —
 * happens before the first byte, so those still answer as normal JSON errors; only the photos are read while streaming.
 */
export const POST = route(async ({ req, requestId }) => {
  const { user } = await requireSession(req);
  const { password } = await readJson(req, exportDataSchema);
  await verifyForExport(user.id, password, { requestId });
  const { entries } = await buildDataExport(user.id);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(zipStream(entries), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="howdy-${user.handle}-${day}.zip"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
