import { expect, test, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Pool } from 'pg';
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
  makeStaff,
} from './helpers';

/**
 * Every signed-in page must be reachable by TAPPING on a phone, not only by typing its address. Pages added to the
 * desktop sidebar once had no way in on a phone; the top bar's "More" menu is that way in.
 */

const db = new Pool({ connectionString: parse(readFileSync('.env.local')).E2E_DATABASE_URL, max: 1 });
test.afterAll(async () => {
  await db.end();
});

async function person(browser: Browser, tag: string, opts: Parameters<typeof newContext>[1]) {
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

const PHONE = { hasTouch: true, isMobile: true, viewport: { width: 320, height: 700 } };

test('on a 320 px phone, the You sheet reaches every page that is not a tab — Moderation too, for staff', async ({
  browser,
}) => {
  const me = await person(browser, 'navphone', PHONE);
  await makeStaff(db, me.handle);
  const problems = await watchProblems(me.page);
  const bar = me.page.getByRole('navigation', { name: 'Primary' });
  const pages: [string, RegExp][] = [
    ['Visitors', /\/visitors$/],
    ['Groups', /\/groups$/],
    ['Moderation', /\/moderation$/],
    ['Settings', /\/settings$/],
  ];
  for (const [label, url] of pages) {
    await me.page.goto('/home');
    await pageReady(me.page);
    expect(await horizontalOverflow(me.page)).toBe(0);
    await bar.getByRole('button', { name: /^You/ }).click();
    const sheet = me.page.getByRole('dialog', { name: 'You' });
    await expect(sheet).toBeVisible();
    if (label === 'Visitors') {
      expect(await axeViolations(me.page)).toEqual([]);
      expect(await smallTargets(me.page)).toEqual([]);
    }
    await sheet.getByRole('link', { name: new RegExp(`^${label}`) }).click();
    await expect(me.page).toHaveURL(url);
  }
  // ＋ opens Create: Time Capsules is one of its three ways to make something.
  await me.page.goto('/home');
  await pageReady(me.page);
  await bar.getByRole('button', { name: 'Create' }).click();
  const create = me.page.getByRole('dialog', { name: 'Create' });
  expect(await axeViolations(me.page)).toEqual([]);
  await create.getByRole('button', { name: /Seal a Time Capsule/ }).click();
  await expect(me.page).toHaveURL(/\/capsules$/);
  // "Write a post" opens Home with the cursor in "What's on your mind?".
  await bar.getByRole('button', { name: 'Create' }).click();
  await create.getByRole('button', { name: /Write a post/ }).click();
  await expect(me.page).toHaveURL(/\/home\?nail=/);
  await expect(me.page.locator('main textarea').first()).toBeFocused();
  // The sheet ends with Sign out: on a phone that is where people look for it.
  await bar.getByRole('button', { name: /^You/ }).click();
  await me.page.getByRole('dialog', { name: 'You' }).getByRole('button', { name: 'Sign out' }).click();
  await expect(me.page).toHaveURL(/\/gate$/);
  await me.page.goto('/home');
  await expect(me.page).toHaveURL(/\/login$/);
  expect(problems).toEqual([]);
  await me.ctx.close();
});

test('on a desktop the sidebar has them, and there is no phone tab bar', async ({ browser }) => {
  const me = await person(browser, 'navdesk', { viewport: { width: 1280, height: 800 } });
  await me.page.goto('/home');
  await pageReady(me.page);
  // The phone tab bar (and its Create and You buttons) is hidden on wide screens.
  await expect(me.page.getByRole('button', { name: 'Create' })).toBeHidden();
  const sidebar = me.page.getByRole('navigation', { name: 'Primary' }).first();
  for (const label of ['Visitors', 'Settings', 'Groups']) {
    await expect(sidebar.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible();
  }
  // Settings is always the last item.
  await expect(sidebar.getByRole('link').last()).toHaveText(/^Settings/);
  // Time Capsules is a now-and-then page: not in the sidebar, but on Home's right panel and in the account menu.
  await expect(sidebar.getByRole('link', { name: 'Time Capsules' })).toHaveCount(0);
  await me.page
    .getByRole('region', { name: 'Time Capsules' })
    .getByRole('link', { name: 'Seal a Time Capsule' })
    .click();
  await expect(me.page).toHaveURL(/\/capsules$/);
  await me.page.getByRole('button', { name: 'Your account' }).click();
  await me.page
    .getByRole('region', { name: 'Your account' })
    .getByRole('link', { name: 'Time Capsules' })
    .click();
  await expect(me.page).toHaveURL(/\/capsules$/);
  await me.ctx.close();
});

test('every loading outline streams inside the shell (top bar first), never on a bare page', async ({
  browser,
}) => {
  // The Workshop once added its shell in the page, not a layout, so its outline arrived with no top bar or sidebar.
  const me = await person(browser, 'navload', { viewport: { width: 1280, height: 800 } });
  for (const path of [
    '/home',
    '/friends',
    '/notifications',
    '/visitors',
    '/messages',
    '/groups',
    '/capsules',
    '/settings',
    `/profile/${me.handle}`,
  ]) {
    const html = await (await me.page.request.get(path)).text();
    const outline = html.indexOf('aria-busy="true"');
    expect(outline, `${path} streams a loading outline`).toBeGreaterThan(-1);
    const header = html.indexOf('<header');
    expect(header > -1 && header < outline, `${path}: the top bar comes before the outline`).toBe(true);
  }
  await me.ctx.close();
});
