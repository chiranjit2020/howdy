import { expect, test, type Browser } from '@playwright/test';
import {
  confirmEmailVia,
  newContext,
  pageReady,
  settleAccount,
  signUpVia,
  stepInsideVia,
  uniqueAccount,
  watchProblems,
} from './helpers';

/**
 * ADR-035, for real: two browsers, our own WebSocket server switched off (`E2E_ABLY=1`), a real Ably app (the key in
 * .env.local). A Whisper must appear in the other person's open thread well before the 8-second fallback check could
 * have fetched it — so it can only have come through Ably's ring. Skipped unless run with E2E_ABLY=1.
 */
test.skip(process.env.E2E_ABLY !== '1', 'needs E2E_ABLY=1 and ABLY_API_KEY in .env.local');

const ORIGIN = 'http://localhost:3300';

async function person(browser: Browser, tag: string) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await settleAccount(account.handle);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}

test('a Whisper appears instantly through Ably, and the ring carries no words', async ({ browser }) => {
  const a = await person(browser, 'ablya');
  const b = await person(browser, 'ablyb');
  const post = (p: typeof a, path: string, data: unknown) =>
    p.page.request.fetch(path, { method: 'POST', data, headers: { origin: ORIGIN } });
  expect((await post(a, `/api/relationships/${b.handle}`, { action: 'request' })).ok()).toBe(true);
  expect((await post(b, `/api/relationships/${a.handle}`, { action: 'accept' })).ok()).toBe(true);

  // Watch everything Ably sends Bob's browser.
  const fromAbly: string[] = [];
  b.page.on('websocket', (ws) => {
    if (!/ably/.test(ws.url())) return;
    ws.on('framereceived', (f) => fromAbly.push(String(f.payload)));
  });
  const problems = await watchProblems(b.page);

  await b.page.goto(`/whispers/${a.handle}`);
  await pageReady(b.page);
  await expect(b.page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible({ timeout: 15_000 });

  const words = `instant hello ${Date.now().toString(36)}`;
  const sentAt = Date.now();
  expect(
    (await post(a, `/api/whispers/${b.handle}`, { clientId: crypto.randomUUID(), body: words })).status(),
  ).toBe(201);
  await expect(b.page.getByText(words)).toBeVisible({ timeout: 6000 });
  const took = Date.now() - sentAt;
  test.info().annotations.push({ type: 'arrived', description: `${took} ms` });
  // The fallback asks every 8 s; arriving clearly sooner means the ring brought it.
  expect(took, `arrived after ${took} ms`).toBeLessThan(6000);

  // Ably carried the ring — and never the words, the sender's call sign or Bob's.
  expect(fromAbly.some((f) => f.includes('ring'))).toBe(true);
  for (const f of fromAbly) {
    expect(f).not.toContain(words);
    expect(f).not.toContain(a.handle);
    expect(f).not.toContain(b.handle);
  }
  expect(problems).toEqual([]);
  await Promise.all([a.ctx.close(), b.ctx.close()]);
});
