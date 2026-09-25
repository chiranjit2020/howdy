import { describe, expect, it } from 'vitest';
import { ResendMailer } from '@/platform/mailer';

function fakeFetch(status: number, body = '{}') {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const message = {
  to: 'rider@example.com',
  subject: 'Verify your email',
  text: 'Open https://howdy.example/v?t=abc',
};

describe('ResendMailer', () => {
  it('posts one plain-text email to the Resend API with the key as a bearer token', async () => {
    const { impl, calls } = fakeFetch(200, '{"id":"x"}');
    await new ResendMailer('re_test_key_123', 'Howdy <no-reply@howdy.example>', impl).send(message);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key_123');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      from: 'Howdy <no-reply@howdy.example>',
      to: ['rider@example.com'],
      subject: 'Verify your email',
      text: message.text,
    });
  });

  it('throws on a rejected send (so the failure is logged), without putting the key or the link in the error', async () => {
    const { impl } = fakeFetch(403, '{"message":"The howdy.example domain is not verified"}');
    const send = new ResendMailer('re_test_key_123', 'Howdy <no-reply@howdy.example>', impl).send(message);
    await expect(send).rejects.toThrow(/HTTP 403.*not verified/);
    const err = await send.catch((e: unknown) => String(e));
    expect(err).not.toContain('re_test_key_123');
    expect(err).not.toContain('t=abc');
  });
});
