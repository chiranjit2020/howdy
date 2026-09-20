import { describe, expect, it } from 'vitest';
import { createLogger } from '@/platform/logger';

function capture() {
  const lines: string[] = [];
  const destination = { write: (s: string) => void lines.push(s) };
  return { lines, log: createLogger({ level: 'info', destination }) };
}

describe('logger redaction', () => {
  it('never writes passwords, tokens, cookies or message bodies', () => {
    const { lines, log } = capture();
    log.info({
      event: 'test',
      password: 'hunter2',
      sessionToken: 'tok_abc',
      body: 'private whisper text',
      req: { headers: { cookie: 'session=abc', authorization: 'Bearer xyz' } },
      nested: { password: 'hunter3', token: 'tok_def' },
    });
    const out = lines.join('');
    for (const secret of [
      'hunter2',
      'hunter3',
      'tok_abc',
      'tok_def',
      'private whisper text',
      'session=abc',
      'Bearer xyz',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[redacted]');
  });

  it('emits structured JSON with severity', () => {
    const { lines, log } = capture();
    log.warn({ event: 'x', requestId: 'r1' });
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toMatchObject({ severity: 'warn', event: 'x', requestId: 'r1', service: 'howdy' });
  });
});
