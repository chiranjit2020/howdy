import { expect, test, type Browser } from '@playwright/test';
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

/** ADR-027: close my account from the Workshop, then change my mind by signing in and keeping it. */

async function person(browser: Browser, tag: string) {
  const account = uniqueAccount(tag);
  // A phone (touch): every control must be a 44 px target.
  const ctx = await newContext(browser, {
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 720 },
  });
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await settleAccount(account.handle);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}

test.describe('Account deletion (production build, real CSP)', () => {
  test('Burn the Deed closes it; signing in within 14 days offers to keep it, and keeping it signs me in', async ({
    browser,
  }) => {
    const me = await person(browser, 'leaver');
    const problems = await watchProblems(me.page);

    await me.page.goto('/workshop');
    await pageReady(me.page);
    const card = me.page
      .locator('.clay')
      .filter({ has: me.page.getByRole('heading', { name: 'Burn the Deed' }) });
    await card.getByLabel('Your password').fill(me.password);
    await card.getByRole('button', { name: 'Delete my account…' }).click();
    await me.page.getByRole('button', { name: 'Yes, delete it' }).click();
    await expect(me.page.getByRole('heading', { name: 'Your account is closed' })).toBeVisible();
    expect(await horizontalOverflow(me.page)).toBe(0);

    // Signed out everywhere: the Workshop now sends me to sign in.
    await me.page.goto('/workshop');
    await expect(me.page).toHaveURL(/\/step-inside/);

    await stepInsideVia(me.page, me.email, me.password);
    const notice = me.page.getByRole('region', { name: 'Your account is closing' });
    await expect(notice).toBeVisible();
    expect(await axeViolations(me.page)).toEqual([]);
    expect(await smallTargets(me.page)).toEqual([]);
    await notice.getByRole('button', { name: 'Keep my account' }).click();
    await expect(me.page).toHaveURL(/\/home$/);

    expect(problems).toEqual([]);
    await me.ctx.close();
  });
});
