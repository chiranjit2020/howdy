import { expect, test, type Browser, type Page } from '@playwright/test';
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

/** ADR-041: "ask to join", Deputies and handing a Town Hall over, with a Deputy and an asker on 320 px phones. */

const PHONE = { hasTouch: true, isMobile: true, viewport: { width: 320, height: 720 } };

async function person(browser: Browser, tag: string, opts: Parameters<typeof newContext>[1] = {}) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser, opts);
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await settleAccount(account.handle);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}
type Person = Awaited<ReturnType<typeof person>>;

const memberRow = (page: Page, handle: string) =>
  page.getByRole('listitem').filter({ hasText: `@${handle}` });

async function checkPhone(page: Page) {
  await pageReady(page);
  expect(await axeViolations(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  expect(await horizontalOverflow(page)).toBe(0);
}

async function askToJoin(p: Person, url: string) {
  await p.page.goto(url);
  await pageReady(p.page);
  await p.page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(p.page.getByRole('button', { name: 'Requested' })).toBeDisabled();
}

test.describe('Town Hall roles (production build, real CSP)', () => {
  test('ask to join, a Deputy lets people in, and the owner hands the Town Hall over', async ({
    browser,
  }) => {
    const owner = await person(browser, 'thowner');
    const dep = await person(browser, 'thdep', PHONE);
    const eve = await person(browser, 'theve', PHONE);
    const problems = await watchProblems(dep.page);
    const name = `Quiet Porch ${Date.now().toString(36)}`;

    // The owner starts a Town Hall that needs approval.
    await owner.page.goto('/town-halls');
    await pageReady(owner.page);
    await owner.page.getByRole('button', { name: 'Start a Town Hall' }).click();
    await owner.page.getByLabel('Name').fill(name);
    await owner.page.getByLabel('What is it about?').fill('Slow evenings, good company.');
    await owner.page.getByRole('switch', { name: /Ask to join/ }).click();
    await owner.page.getByRole('button', { name: 'Start it' }).click();
    await owner.page.getByRole('tab', { name: /^Mine/ }).click();
    const manage = owner.page.getByRole('link', { name: /^Manage/ }).first();
    const url = (await manage.getAttribute('href'))!;

    // The future Deputy asks, and the owner lets them in and appoints them.
    await askToJoin(dep, url);
    await owner.page.goto(url);
    const asking = owner.page.getByRole('heading', { name: /Asking to join/ });
    await expect(asking).toBeVisible();
    await memberRow(owner.page, dep.handle).getByRole('button', { name: 'Let in' }).click();
    await owner.page.reload();
    await memberRow(owner.page, dep.handle)
      .getByRole('button', { name: `Options for @${dep.handle}` })
      .click();
    await owner.page.getByRole('menuitem', { name: 'Make a Deputy' }).click();
    await expect(memberRow(owner.page, dep.handle).getByText('Deputy', { exact: true })).toBeVisible();

    // Someone else asks, from a phone: told it is with the people who look after it.
    await askToJoin(eve, url);
    await expect(
      eve.page.getByText('Your request is with the people who look after this Town Hall.'),
    ).toBeVisible();
    await checkPhone(eve.page);

    // The Deputy, on a phone, sees the request and lets them in.
    await dep.page.goto(url);
    await expect(dep.page.getByRole('heading', { name: 'Asking to join (1)' })).toBeVisible();
    await checkPhone(dep.page);
    await memberRow(dep.page, eve.handle).getByRole('button', { name: 'Let in' }).click();
    await expect(dep.page.getByRole('heading', { name: /Asking to join/ })).toBeHidden();
    await eve.page.reload();
    await expect(eve.page.getByRole('button', { name: 'Leave' })).toBeVisible();

    // A Deputy may remove an ordinary member (the menu is there) but has no menu on the owner.
    await dep.page.reload();
    await expect(
      memberRow(dep.page, eve.handle).getByRole('button', { name: `Options for @${eve.handle}` }),
    ).toBeVisible();
    await expect(memberRow(dep.page, owner.handle).getByRole('button', { name: /^Options for/ })).toHaveCount(
      0,
    );

    // The owner hands it over.
    await owner.page.reload();
    await memberRow(owner.page, dep.handle)
      .getByRole('button', { name: `Options for @${dep.handle}` })
      .click();
    await owner.page.getByRole('menuitem', { name: 'Hand the Town Hall to them…' }).click();
    await owner.page.getByRole('alertdialog').getByRole('button', { name: 'Hand it over' }).click();
    await expect(owner.page.getByRole('button', { name: 'Leave' })).toBeVisible();
    await expect(owner.page.getByRole('heading', { name: 'Danger zone' })).toBeHidden();
    await dep.page.reload();
    await expect(dep.page.getByRole('heading', { name: 'Danger zone' })).toBeVisible();
    await checkPhone(dep.page);
    expect(problems).toEqual([]);
    for (const p of [owner, dep, eve]) await p.ctx.close();
  });
});
