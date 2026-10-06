import { expect, test } from '@playwright/test';
import {
  axeViolations,
  horizontalOverflow,
  newContext,
  pageReady,
  smallTargets,
  watchProblems,
} from './helpers';

/** The welcome page: the link people share. It must look right on the smallest phone and say what Howdy is at once. */

const PHONE = { hasTouch: true, isMobile: true, viewport: { width: 320, height: 720 } };

test.describe('Welcome page (production build, real CSP)', () => {
  for (const [label, opts] of [
    ['320 px phone', PHONE],
    ['desktop', { viewport: { width: 1280, height: 860 } }],
  ] as const) {
    test(`reads well on a ${label}`, async ({ browser }) => {
      const ctx = await newContext(browser, opts);
      const page = await ctx.newPage();
      const problems = await watchProblems(page);
      await page.goto('/welcome');
      await pageReady(page);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Your people.');
      await expect(page.getByRole('heading', { name: /built and working right now/ })).toBeVisible();
      await expect(page.getByRole('heading', { name: /what comes next/ })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      expect(await smallTargets(page)).toEqual([]);
      expect(await horizontalOverflow(page)).toBe(0);
      // "Take the tour" scrolls to what is built.
      await page.getByRole('link', { name: 'Take the tour' }).click();
      await expect(page).toHaveURL(/#tour$/);
      expect(problems).toEqual([]);
      await ctx.close();
    });
  }

  test('a signed-out visit to / lands here, and the share card is a real image', async ({
    browser,
    request,
  }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome$/);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toBeTruthy();
    const res = await request.get(new URL(og!).pathname);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
    expect((await res.body()).length).toBeGreaterThan(10_000);
    await ctx.close();
  });
});
