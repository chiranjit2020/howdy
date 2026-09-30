import { expect, test, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
  axeViolations,
  confirmEmailVia,
  horizontalOverflow,
  newContext,
  pageReady,
  settleAccount,
  signUpVia,
  stepInsideVia,
  uniqueAccount,
  watchProblems,
} from './helpers';

/** Portraits beyond the Porch: on Post Cards and in Chimes, on a 320 px phone, with the real CSP. */

const PHONE = { hasTouch: true, isMobile: true, viewport: { width: 320, height: 720 } };
const ORIGIN = { origin: 'http://localhost:3300' };

async function person(browser: Browser, tag: string) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser, PHONE);
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await settleAccount(account.handle);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}

/** Portrait images on screen, and whether every one of them really decoded. */
const portraits = (page: Page) =>
  page.evaluate(() => {
    const shown = [...document.querySelectorAll('img')].filter(
      (i) => i.src.includes('/api/portraits/') && i.getClientRects().length > 0,
    );
    return {
      count: shown.length,
      decoded: shown.length > 0 && shown.every((i) => i.complete && i.naturalWidth > 0),
    };
  });

test('a Pal’s photo shows on their Post Card and in my Chimes', async ({ browser }) => {
  const a = await person(browser, 'snapper');
  const b = await person(browser, 'looker');
  const problems = await watchProblems(b.page);

  // A adds a Portrait (the same way the Workshop does it).
  await a.page.goto('/workshop');
  const photo = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#8fb8ff' } })
    .jpeg()
    .toBuffer();
  const chooser = a.page.locator('input[type=file]').first();
  await expect(async () => {
    await chooser.setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: photo });
    await expect(a.page.getByRole('status').filter({ hasText: 'Portrait updated.' })).toBeVisible({
      timeout: 5000,
    });
  }).toPass({ timeout: 45_000 });

  // B asks, A says yes (B's bell rings with A's name), and A nails a card to their own Fence.
  expect(
    (
      await b.page.request.post(`/api/relationships/${a.handle}`, {
        data: { action: 'request' },
        headers: ORIGIN,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await a.page.request.post(`/api/relationships/${b.handle}`, {
        data: { action: 'accept' },
        headers: ORIGIN,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await a.page.request.post(`/api/porch/${a.handle}/fence`, {
        data: { body: 'Hello from the porch' },
        headers: ORIGIN,
      })
    ).status(),
  ).toBe(201);

  // On A's Porch, the card carries A's photo for B.
  await b.page.goto(`/porch/${a.handle}`);
  await pageReady(b.page);
  const card = b.page.locator('article, li').filter({ hasText: 'Hello from the porch' }).first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('img[src*="/api/portraits/"]').first()).toBeVisible();
  await expect.poll(async () => (await portraits(b.page)).decoded, { timeout: 15_000 }).toBe(true);
  expect(await horizontalOverflow(b.page)).toBe(0);

  // In B's Chimes, "said yes" shows A's photo with the Chime's icon in its corner.
  await b.page.goto('/chimes');
  await pageReady(b.page);
  await expect(b.page.getByText(/said yes/)).toBeVisible();
  await expect.poll(async () => (await portraits(b.page)).count, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await portraits(b.page)).decoded, { timeout: 15_000 }).toBe(true);
  expect(await horizontalOverflow(b.page)).toBe(0);
  expect(await axeViolations(b.page)).toEqual([]);
  await b.page.screenshot({ path: 'test-results/portraits-chimes.png' });

  expect(problems).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});
