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

/** ADR-042: a Deputy bans a member from a phone; the ban is silent to them; lifting lets them join again. */

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

const memberRow = (page: Page, handle: string) =>
  page.getByRole('listitem').filter({ hasText: `@${handle}` });
/** The roster and the running of the group (bans among it) sit behind their own tabs (ADR-054). */
const openTab = (page: Page, name: 'Members' | 'Manage') =>
  page.getByRole('tab', { name, exact: true }).click();

async function checkPhone(page: Page) {
  await pageReady(page);
  expect(await axeViolations(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  expect(await horizontalOverflow(page)).toBe(0);
}

test.describe('Group bans (production build, real CSP)', () => {
  test('a Deputy bans a member, who only ever sees an unanswered request; lifting lets them back', async ({
    browser,
  }) => {
    test.slow(); // several people signing up on phones: past the default limit on a busy machine
    const owner = await person(browser, 'tbowner');
    const dep = await person(browser, 'tbdep', PHONE);
    const eve = await person(browser, 'tbeve', PHONE);
    const problems = await watchProblems(dep.page);
    const name = `Open profile ${Date.now().toString(36)}`;

    // An "anyone can join" Town Hall.
    await owner.page.goto('/groups');
    await pageReady(owner.page);
    await owner.page.getByRole('button', { name: 'Start a group' }).click();
    await owner.page.getByLabel('Name').fill(name);
    await owner.page.getByLabel('What is it about?').fill('Anyone welcome.');
    await owner.page.getByLabel('Who can find it?').selectOption('open');
    await owner.page.getByRole('button', { name: 'Start it' }).click();
    // Starting one lands on it (ADR-054); its address is the link others open.
    await expect(owner.page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/);
    const url = new URL(owner.page.url()).pathname;

    for (const p of [dep, eve]) {
      await p.page.goto(url);
      await pageReady(p.page);
      await p.page.getByRole('button', { name: 'Join', exact: true }).click();
      await expect(p.page.getByRole('button', { name: 'Leave' })).toBeVisible();
    }
    await owner.page.goto(url);
    await openTab(owner.page, 'Members');
    await memberRow(owner.page, dep.handle)
      .getByRole('button', { name: `Options for @${dep.handle}` })
      .click();
    await owner.page.getByRole('menuitem', { name: 'Make a Deputy' }).click();
    await expect(memberRow(owner.page, dep.handle).getByText('Deputy', { exact: true })).toBeVisible();

    // The Deputy, on a phone, bans Eve from the Members list.
    await dep.page.reload();
    await pageReady(dep.page);
    await openTab(dep.page, 'Members');
    await memberRow(dep.page, eve.handle)
      .getByRole('button', { name: `Options for @${eve.handle}` })
      .click();
    await dep.page.getByRole('menuitem', { name: 'Ban…' }).click();
    await dep.page.getByRole('alertdialog').getByRole('button', { name: 'Ban' }).click();
    await expect(memberRow(dep.page, eve.handle)).toHaveCount(0); // gone from the Members tab
    await openTab(dep.page, 'Manage');
    await expect(dep.page.getByRole('heading', { name: 'Banned (1)' })).toBeVisible();
    await expect(dep.page.getByRole('heading', { name: /^Banned/ })).toHaveCount(1);
    // On the Manage tab the only row naming her is the ban.
    await expect(memberRow(dep.page, eve.handle)).toHaveCount(1);
    await expect(memberRow(dep.page, eve.handle).getByText(`by @${dep.handle}`)).toBeVisible();
    await checkPhone(dep.page);

    // Eve is out, and to her the Town Hall now only takes requests — which are never answered.
    await eve.page.reload();
    await pageReady(eve.page);
    await expect(eve.page.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0);
    await expect(eve.page.getByText('New members are let in by the owner or a Deputy.')).toBeVisible();
    await eve.page.getByRole('button', { name: 'Ask to join' }).click();
    await expect(eve.page.getByRole('button', { name: 'Requested' })).toBeDisabled();
    await expect(eve.page.getByText(/banned/i)).toHaveCount(0);
    await checkPhone(eve.page);
    // Nothing reaches the staff.
    await dep.page.reload();
    await pageReady(dep.page);
    await expect(dep.page.getByRole('heading', { name: /Asking to join/ })).toHaveCount(0);

    // Lifting the ban: Eve may join again with one tap.
    await openTab(dep.page, 'Manage');
    await memberRow(dep.page, eve.handle).getByRole('button', { name: 'Lift ban' }).click();
    await expect(dep.page.getByRole('heading', { name: 'Banned', exact: true })).toBeVisible();
    await eve.page.reload();
    await pageReady(eve.page);
    await eve.page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(eve.page.getByRole('button', { name: 'Leave' })).toBeVisible();
    expect(problems).toEqual([]);
    for (const p of [owner, dep, eve]) await p.ctx.close();
  });
});
