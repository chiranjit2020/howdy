import { expect, test } from '@playwright/test';
import { newContext, pageReady } from './helpers';

/**
 * ADR-034, changed 2026-11-11: the Dynamic Island no longer drops in to offer the app (nearly everyone closed it by
 * reflex). The offer is a bar at the top of Home on phones instead (tests/ui/island.test.tsx covers the bar itself).
 */

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

test('a phone landing on the Gate gets no install pop-up', async ({ browser }) => {
  const ctx = await newContext(browser, {
    island: true,
    userAgent: ANDROID_CHROME,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 720 },
  });
  const page = await ctx.newPage();
  await page.goto('/gate');
  await pageReady(page);
  await page.waitForTimeout(3500); // longer than the old island's delay
  await expect(page.getByRole('region', { name: 'Howdy island' })).toHaveCount(0);
  await expect(page.getByText('Get the Howdy app')).toHaveCount(0);
  await ctx.close();
});
