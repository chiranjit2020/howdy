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

test('on a 320 px phone, "More" reaches every page that is not a tab — Moderation too, for staff', async ({
  browser,
}) => {
  const me = await person(browser, 'navphone', PHONE);
  await db.query("update users set role = 'moderator' where handle = $1", [me.handle]);
  const problems = await watchProblems(me.page);
  const pages: [string, RegExp][] = [
    ['Tracks', /\/tracks$/],
    ['Workshop', /\/workshop$/],
    ['Town Halls', /\/town-halls$/],
    ['Time Capsules', /\/capsules$/],
    ['Moderation', /\/moderation$/],
  ];
  for (const [label, url] of pages) {
    await me.page.goto('/home');
    await pageReady(me.page);
    expect(await horizontalOverflow(me.page)).toBe(0);
    await me.page.getByRole('button', { name: /^More pages/ }).click();
    const menu = me.page.getByRole('menu', { name: 'More' });
    await expect(menu).toBeVisible();
    if (label === 'Tracks') {
      expect(await axeViolations(me.page)).toEqual([]);
      expect(await smallTargets(me.page)).toEqual([]);
    }
    await menu.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click();
    await expect(me.page).toHaveURL(url);
  }
  // The menu ends with Sign out: on a phone that is where people look for it.
  await me.page.getByRole('button', { name: /^More pages/ }).click();
  await me.page.getByRole('menu', { name: 'More' }).getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(me.page).toHaveURL(/\/gate$/);
  await me.page.goto('/home');
  await expect(me.page).toHaveURL(/\/step-inside$/);
  expect(problems).toEqual([]);
  await me.ctx.close();
});

test('on a desktop the sidebar has them, and there is no "More" button', async ({ browser }) => {
  const me = await person(browser, 'navdesk', { viewport: { width: 1280, height: 800 } });
  await me.page.goto('/home');
  await pageReady(me.page);
  await expect(me.page.getByRole('button', { name: /^More pages/ })).toBeHidden();
  const sidebar = me.page.getByRole('navigation', { name: 'Primary' }).first();
  for (const label of ['Tracks', 'Workshop', 'Town Halls', 'Time Capsules']) {
    await expect(sidebar.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible();
  }
  await me.ctx.close();
});

test('every loading outline streams inside the shell (top bar first), never on a bare page', async ({
  browser,
}) => {
  // The Workshop once added its shell in the page, not a layout, so its outline arrived with no top bar or sidebar.
  const me = await person(browser, 'navload', { viewport: { width: 1280, height: 800 } });
  for (const path of [
    '/home',
    '/pals',
    '/chimes',
    '/tracks',
    '/whispers',
    '/town-halls',
    '/workshop',
    `/porch/${me.handle}`,
  ]) {
    const html = await (await me.page.request.get(path)).text();
    const outline = html.indexOf('aria-busy="true"');
    expect(outline, `${path} streams a loading outline`).toBeGreaterThan(-1);
    const header = html.indexOf('<header');
    expect(header > -1 && header < outline, `${path}: the top bar comes before the outline`).toBe(true);
  }
  await me.ctx.close();
});
