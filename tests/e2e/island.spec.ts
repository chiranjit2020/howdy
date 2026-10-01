import { expect, test, type Browser } from '@playwright/test';
import {
  axeViolations,
  horizontalOverflow,
  newContext,
  pageReady,
  smallTargets,
  watchProblems,
} from './helpers';

/** ADR-034: the Dynamic Island offers to install Howdy on phones whose browser does not offer it by itself. */

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const SAMSUNG =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const phone = (browser: Browser, userAgent: string) =>
  newContext(browser, {
    island: true,
    userAgent,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 720 },
  });

test.describe('Dynamic Island (production build, real CSP)', () => {
  test('lands on the Gate, drops in, opens by itself with Android steps; × snoozes it across visits', async ({
    browser,
  }) => {
    const ctx = await phone(browser, ANDROID_CHROME);
    const page = await ctx.newPage();
    const problems = await watchProblems(page);
    await page.goto('/gate');
    await pageReady(page);

    const island = page.getByRole('region', { name: 'Howdy island' });
    await expect(island).toBeVisible();
    const pill = island.getByRole('button', { name: 'Get the Howdy app', exact: true });
    await expect(pill).toHaveAttribute('aria-expanded', 'true'); // opened by itself
    await expect(island.getByText('Tap the menu (⋮) at the top right.')).toBeVisible();

    expect(await axeViolations(page)).toEqual([]);
    expect(await smallTargets(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toBe(0);
    await page.screenshot({ path: 'test-results/island-android.png' });

    // Tapping the pill folds it back to a pill.
    await pill.tap();
    await expect(pill).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: 'test-results/island-compact.png' });

    await island.getByRole('button', { name: 'Dismiss: Get the Howdy app' }).tap();
    await expect(island).toHaveCount(0);
    await page.reload();
    await pageReady(page);
    await page.waitForTimeout(3500); // longer than the island's delay
    await expect(page.getByRole('region', { name: 'Howdy island' })).toHaveCount(0);

    expect(problems).toEqual([]);
    await ctx.close();
  });

  test('Samsung Internet and iPhone get their own steps; a computer gets nothing', async ({ browser }) => {
    for (const [ua, step] of [
      [SAMSUNG, 'Tap “Add page to”, then “Home screen”.'],
      [IPHONE, 'Scroll down and tap “Add to Home Screen”.'],
    ] as const) {
      const ctx = await phone(browser, ua);
      const page = await ctx.newPage();
      await page.goto('/gate');
      await expect(page.getByRole('region', { name: 'Howdy island' }).getByText(step)).toBeVisible();
      await ctx.close();
    }

    const desk = await newContext(browser, { island: true });
    const page = await desk.newPage();
    await page.goto('/gate');
    await pageReady(page);
    await page.waitForTimeout(3500);
    await expect(page.getByRole('region', { name: 'Howdy island' })).toHaveCount(0);
    await desk.close();
  });
});
