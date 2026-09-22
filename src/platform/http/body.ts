import type { z } from 'zod';
import { AppError } from '../errors';

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Read a raw (binary) body of AT MOST `maxBytes`. Stops reading and refuses the moment it goes over, so an oversized or endless
 * upload can never fill memory (a Content-Length header is a hint, not a limit: it can lie or be missing).
 */
export async function readBytesCapped(req: Request, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new AppError('BAD_REQUEST');
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new AppError('BAD_REQUEST');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Read and validate a JSON body. Enforces content type and a small size cap before parsing, and turns schema
 * failures into field-level VALIDATION_FAILED errors whose messages come from our own schemas (safe to show).
 */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) throw new AppError('BAD_REQUEST');

  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new AppError('BAD_REQUEST');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new AppError('BAD_REQUEST');

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AppError('BAD_REQUEST');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError('BAD_REQUEST');

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      fields[key] ??= issue.message;
    }
    throw new AppError('VALIDATION_FAILED', { fields });
  }
  return parsed.data;
}
