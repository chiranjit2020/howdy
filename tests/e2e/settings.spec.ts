import { expect, test, type Browser } from '@playwright/test';
import {
  axeViolations,
  confirmEmailVia,
  horizontalOverflow,
  newContext,
  pageReady,
  signUpVia,
  smallTargets,
  stepInsideVia,
  uniqueAccount,
  watchProblems,
} from './helpers';

/** Settings is five short pages (Profile, Privacy, Notifications, People, Account) under one heading and a row of tabs. */

async function person(browser: Browser, tag: string, opts: Parameters<typeof newContext>[1] = {}) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser, opts);
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}
const SECTIONS = [
  ['Profile', '/settings'],
  ['Privacy', '/settings/privacy'],
  ['Notifications', '/settings/notifications'],
  ['People', '/settings/people'],
  ['Account', '/settings/account'],
] as const;

test.describe('Settings: five short pages under one set of tabs (production build, real CSP)', () => {
  test('the tabs reach every section and mark the current one; privacy saves as it changes', async ({
    browser,
  }) => {
    const a = await person(browser, 'tabs');
    const problems = await watchProblems(a.page);
    await a.page.goto('/settings');
    await pageReady(a.page);
    const tabs = a.page.getByRole('navigation', { name: 'Settings sections' });
    for (const [label, path] of SECTIONS) {
      await tabs.getByRole('link', { name: label, exact: true }).click();
      await expect(a.page).toHaveURL(new RegExp(`${path}$`));
      await expect(tabs.getByRole('link', { name: label, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(a.page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    }

    // Privacy has no Save button: a change is saved at once, and is still there after a reload.
    await a.page.goto('/settings/privacy');
    await pageReady(a.page);
    await expect(a.page.getByRole('button', { name: /^Save/ })).toHaveCount(0);
    await a.page.getByLabel('Who can visit your profile?').selectOption('posse');
    await expect(a.page.getByRole('status').filter({ hasText: 'Privacy updated' })).toBeVisible();
    await a.page.reload();
    await pageReady(a.page);
    await expect(a.page.getByLabel('Who can visit your profile?')).toHaveValue('posse');

    expect(problems).toEqual([]);
    await a.ctx.close();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations on any section (${scheme})`, async ({ browser }) => {
      const a = await person(browser, `sx${scheme[0]}`, {
        colorScheme: scheme,
        bypassCSP: true,
        reducedMotion: 'reduce',
      });
      for (const [, path] of SECTIONS) {
        await a.page.goto(path);
        await pageReady(a.page);
        expect(await axeViolations(a.page), `${path} (${scheme})`).toEqual([]);
      }
      await a.ctx.close();
    });
  }

  test('no horizontal scroll at 320px and every control is at least 44px on touch, on every section', async ({
    browser,
  }) => {
    const a = await person(browser, 'small', {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 700 },
    });
    for (const [, path] of SECTIONS) {
      await a.page.goto(path);
      await pageReady(a.page);
      expect(await horizontalOverflow(a.page), `${path} overflow`).toBeLessThanOrEqual(0);
      expect(await smallTargets(a.page), `${path} small targets`).toEqual([]);
    }
    await a.ctx.close();
  });
});
