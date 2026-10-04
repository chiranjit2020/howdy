import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  axeViolations,
  confirmEmailVia,
  horizontalOverflow,
  newContext,
  pageReady,
  settleAccount,
  signUpVia,
  smallTargets,
  stepInsideVia,
  uniqueAccount,
  watchProblems,
} from './helpers';

/** ADR-037: "Download my data" in the Workshop, on a 320 px phone, under the production CSP. */

test.describe('Download my data (production build, real CSP)', () => {
  test('a wrong password says so; the right one saves a ZIP named after me', async ({ browser }) => {
    const me = uniqueAccount('exporter');
    const ctx = await newContext(browser, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 720 },
    });
    const page = await ctx.newPage();
    await signUpVia(page, me);
    await settleAccount(me.handle);
    await confirmEmailVia(page, me.email);
    await stepInsideVia(page, me.email, me.password);
    await expect(page).toHaveURL(/\/home$/);
    const problems = await watchProblems(page);

    await page.goto('/workshop');
    await pageReady(page);
    const card = page
      .locator('.clay')
      .filter({ has: page.getByRole('heading', { name: 'Download my data' }) });
    await card.scrollIntoViewIfNeeded();
    expect(await axeViolations(page)).toEqual([]);
    expect(await smallTargets(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toBe(0);

    await card.getByLabel('Your password').fill('definitely not it');
    await card.getByRole('button', { name: 'Download my data' }).click();
    await expect(card.getByText('That password is not right.')).toBeVisible();

    await card.getByLabel('Your password').fill(me.password);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      card.getByRole('button', { name: 'Download my data' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^howdy-${me.handle}-\\d{4}-\\d{2}-\\d{2}\\.zip$`),
    );
    const bytes = await readFile((await download.path())!);
    expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304'); // a ZIP
    expect(bytes.includes(Buffer.from('data.json'))).toBe(true);
    expect(bytes.includes(Buffer.from(`"callSign": "${me.handle}"`))).toBe(true);
    await expect(card.getByText('Your download has started.')).toBeVisible();

    // The 400 for the wrong password is expected; nothing else may have gone wrong.
    expect(problems.filter((p) => !p.includes('400'))).toEqual([]);
    await ctx.close();
  });
});
