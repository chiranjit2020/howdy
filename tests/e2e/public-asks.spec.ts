import { expect, test, type Browser } from '@playwright/test';
import {
  axeViolations,
  confirmEmailVia,
  horizontalOverflow,
  newContext,
  pageReady,
  signUpVia,
  settleAccount,
  smallTargets,
  stepInsideVia,
  uniqueAccount,
  watchProblems,
} from './helpers';

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

const PHONE = { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true };

/**
 * ADR-066: ask everyone from the Buy or wait page; a stranger finds it on Home (phone), answers with the emoji buttons
 * and a reason; signed out, its link shows the question with a way to join.
 */
test('ask everyone, a stranger answers from Home on a phone, the link opens signed out', async ({
  browser,
}) => {
  test.slow(); // two people sign up
  const item = `Air fryer ${Date.now().toString(36)}`;
  const priya = await person(browser, 'pubasker');
  const rahul = await person(browser, 'pubanswer', PHONE);
  const problems = await watchProblems(priya.page);

  // Priya asks everyone from the Buy or wait page.
  const p = priya.page;
  await p.goto('/buy-or-wait');
  await pageReady(p);
  await p.getByRole('button', { name: 'Ask a question' }).click();
  const dialog = p.getByRole('dialog', { name: 'Buy or wait?' });
  await expect(dialog.getByRole('radio', { name: /Everyone on Howdy/ })).toBeChecked();
  await dialog.getByLabel('What do you want to buy?').fill(item);
  await dialog.getByLabel('Price').fill('6499');
  await dialog.getByLabel('Why do you want it?').fill('I cook every evening and want fewer oily dishes.');
  expect(await axeViolations(p)).toEqual([]);
  await dialog.getByRole('button', { name: 'Ask everyone' }).click();
  const mine = p.getByRole('region', { name: `Buy or wait: ${item}` });
  await expect(mine).toContainText('₹6,499');
  await expect(p.getByRole('button', { name: 'Share link' }).first()).toBeVisible();

  // Rahul, a stranger on a phone, finds it on Home and answers Wait with a reason.
  const r = rahul.page;
  await r.goto('/home');
  await pageReady(r);
  const card = r.getByRole('region', { name: /Buy or wait\?/ });
  await card.getByRole('link', { name: new RegExp(item) }).click();
  await expect(r).toHaveURL(/\/buy-or-wait\/[0-9a-f-]+$/);
  const link = r.url();
  const q = r.getByRole('region', { name: `Buy or wait: ${item}` });
  await q.getByRole('button', { name: /^Wait/ }).click();
  await expect(q.getByRole('button', { name: /^Wait/ })).toHaveAttribute('aria-pressed', 'true');
  await q.getByLabel('Why wait?').fill('The Big Billion Days sale is next week');
  await q.getByRole('button', { name: 'Send answer' }).click();
  await expect(q).toContainText('You said Wait');
  await expect(q).toContainText('0 say buy · 1 say wait');
  expect(await horizontalOverflow(r)).toBe(0);
  expect(await axeViolations(r)).toEqual([]);
  expect(await smallTargets(r)).toEqual([]);
  // The phone tab bar now has Groups.
  await expect(
    r.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Groups/ }),
  ).toBeVisible();

  // Priya sees his name and reason.
  await p.reload();
  await pageReady(p);
  await expect(mine).toContainText('The Big Billion Days sale is next week');

  // Signed out, the link shows the question and a way to join; the buttons lead to sign up.
  const anon = await newContext(browser, PHONE);
  const a = await anon.newPage();
  await a.goto(new URL(link).pathname);
  await pageReady(a);
  const open = a.getByRole('region', { name: `Buy or wait: ${item}` });
  await expect(open).toContainText('1 say wait');
  await expect(open.getByRole('link', { name: /^Buy/ })).toHaveAttribute('href', '/signup');
  await expect(a.getByRole('link', { name: 'Join Howdy' })).toBeVisible();
  expect(await horizontalOverflow(a)).toBe(0);
  expect(await axeViolations(a)).toEqual([]);

  expect(problems).toEqual([]);
  await Promise.all([priya.ctx.close(), rahul.ctx.close(), anon.close()]);
});
