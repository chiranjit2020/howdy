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

/** ADR-045: share your invite link from a phone; a friend opens it, joins, and you get their Pal request. */

const PHONE = { hasTouch: true, isMobile: true, viewport: { width: 320, height: 720 } };

async function member(browser: Browser, tag: string) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser, PHONE);
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await settleAccount(account.handle);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}

test.describe('Invite links (production build, real CSP)', () => {
  test('a friend joins through my link and I get their Pal request', async ({ browser }) => {
    test.slow(); // two people signing up on phones
    const rick = await member(browser, 'invrick');
    const problems = await watchProblems(rick.page);

    // My link, on the Pals page.
    await rick.page.goto('/pals');
    await pageReady(rick.page);
    await expect(rick.page.getByRole('heading', { name: 'Invite friends to Howdy' })).toBeVisible();
    const link = (await rick.page.getByText(/\/i\/[A-Za-z0-9]{10}$/).textContent())!.trim();
    const path = new URL(link).pathname;
    expect(await axeViolations(rick.page)).toEqual([]);
    expect(await smallTargets(rick.page)).toEqual([]);
    expect(await horizontalOverflow(rick.page)).toBe(0);

    // A friend opens it on their phone: the welcome page, naming who invited them.
    const friend = uniqueAccount('invfriend');
    const ctx = await newContext(browser, PHONE);
    const page = await ctx.newPage();
    const friendProblems = await watchProblems(page);
    await page.goto(path);
    await pageReady(page);
    await expect(page.getByText(`${rick.handle} invited you to Howdy`)).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toBe(0);
    // The link's preview card names the inviter; it is drawn per link, so check it really renders.
    await expect(page).toHaveTitle(`${rick.handle} invited you to Howdy`);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    const card = await page.request.get(new URL(og!).pathname + new URL(og!).search);
    expect(card.status()).toBe(200);
    expect(card.headers()['content-type']).toContain('image/png');
    await page
      .locator('#main')
      .getByRole('link', { name: /^Stake a Claim/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/stake-a-claim\?invite=/);
    await expect(page.getByText(/invited you\. Once you confirm your email/)).toBeVisible();
    await page.getByLabel('Choose a handle').fill(friend.handle);
    await page.getByLabel('Email address').fill(friend.email);
    await page.getByLabel('Password', { exact: true }).fill(friend.password);
    await page.getByRole('checkbox', { name: /I am 18 or older/ }).check();
    await page.getByRole('button', { name: 'Create My Account' }).click();
    await page.getByRole('heading', { name: 'Check your email' }).waitFor();
    await confirmEmailVia(page, friend.email);

    // Their Pal request is waiting for me — I decide.
    await expect(async () => {
      await rick.page.reload();
      await expect(rick.page.getByText(/Requests for you \(1\)/)).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    await expect(rick.page.getByText(`@${friend.handle}`)).toBeVisible();
    await expect(rick.page.getByText('1 joined with it this week')).toBeVisible();
    expect(problems).toEqual([]);
    expect(friendProblems).toEqual([]);
    await ctx.close();
    await rick.ctx.close();
  });

  test('a made-up link is just the welcome page', async ({ browser }) => {
    const ctx = await newContext(browser, PHONE);
    const page = await ctx.newPage();
    await page.goto('/i/AAAAAAAAAA');
    await pageReady(page);
    await expect(page.getByText('A small-circle social world')).toBeVisible();
    await expect(page.getByText(/invited you/)).toHaveCount(0);
    await page
      .locator('#main')
      .getByRole('link', { name: /^Stake a Claim/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/stake-a-claim$/);
    await ctx.close();
  });
});
