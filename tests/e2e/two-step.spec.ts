import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { totpCode } from '../../src/modules/auth/totp';
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

/**
 * ADR-040: passkeys and authenticator-app codes, from the Workshop to the sign-in page, on a 320 px phone under the
 * production CSP. Passkeys use Chromium's virtual authenticator (a platform key with a "fingerprint" that always says
 * yes), so the browser side of WebAuthn runs for real.
 */

const PHONE = { hasTouch: true, isMobile: true, viewport: { width: 320, height: 720 } };

async function virtualPasskeyDevice(ctx: BrowserContext, page: Page): Promise<void> {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

const securityCard = (page: Page) =>
  page.locator('.clay').filter({ has: page.getByRole('heading', { name: 'Sign-in security' }) });

async function confirmWithPassword(page: Page, password: string, button: string) {
  const card = securityCard(page);
  await card.getByLabel('Your password').fill(password);
  await card.getByRole('button', { name: button }).click();
}

/** The recovery codes on screen (shown once), then dismissed. */
async function takeRecoveryCodes(page: Page): Promise<string[]> {
  const panel = page.getByRole('region', { name: 'Your recovery codes' });
  await expect(panel).toBeVisible();
  const codes = (await panel.getByRole('listitem').allTextContents()).map((c) => c.trim());
  expect(codes).toHaveLength(10);
  await panel.getByRole('button', { name: 'I’ve saved them' }).click();
  return codes;
}

async function signedInMember(page: Page, tag: string) {
  const me = uniqueAccount(tag);
  await signUpVia(page, me);
  await confirmEmailVia(page, me.email);
  await stepInsideVia(page, me.email, me.password);
  await expect(page).toHaveURL(/\/home$/);
  return me;
}

test.describe('Two-step sign-in (production build, real CSP)', () => {
  test('add a passkey on a phone, then sign in with it alone', async ({ browser }) => {
    const ctx = await newContext(browser, PHONE);
    const page = await ctx.newPage();
    await virtualPasskeyDevice(ctx, page);
    const me = await signedInMember(page, 'passkey');
    const problems = await watchProblems(page);

    await page.goto('/workshop');
    await pageReady(page);
    const card = securityCard(page);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByText('Two-step sign-in is off.', { exact: false })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    expect(await smallTargets(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toBe(0);

    await card.getByRole('button', { name: 'Add a passkey' }).click();
    await confirmWithPassword(page, 'not my password', 'Continue');
    await expect(card.getByText('That password is not right.')).toBeVisible();
    await confirmWithPassword(page, me.password, 'Continue');
    await takeRecoveryCodes(page);
    await expect(card.getByText('Two-step sign-in is on', { exact: false })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Remove' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    expect(await smallTargets(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toBe(0);

    // Signed out: the password alone is no longer enough...
    await ctx.clearCookies();
    await page.goto('/step-inside');
    await page.getByLabel('Handle or email').fill(me.email);
    await page.getByLabel('Password').fill(me.password);
    await page.getByRole('button', { name: 'Step Inside' }).click();
    await expect(page.getByRole('heading', { name: 'One more step' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    expect(await smallTargets(page)).toEqual([]);
    // ...but the passkey is, from the second-step screen or straight from the sign-in page.
    await page.getByRole('button', { name: 'Use a passkey instead' }).click();
    await expect(page).toHaveURL(/\/home$/);

    await ctx.clearCookies();
    await page.goto('/step-inside');
    await pageReady(page);
    await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
    await expect(page).toHaveURL(/\/home$/);
    expect(problems).toEqual([]);
    await ctx.close();
  });

  test('link an authenticator app; sign in with a code, then with a recovery code', async ({ browser }) => {
    const ctx = await newContext(browser, PHONE);
    const page = await ctx.newPage();
    const me = await signedInMember(page, 'totp');
    const problems = await watchProblems(page);

    await page.goto('/workshop');
    await pageReady(page);
    const card = securityCard(page);
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', { name: 'Link an app' }).click();
    await confirmWithPassword(page, me.password, 'Continue');
    await expect(card.getByRole('img', { name: 'QR code for linking an authenticator app' })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Open in authenticator app' })).toHaveAttribute(
      'href',
      /^otpauth:\/\/totp\//,
    );
    expect(await axeViolations(page)).toEqual([]);
    expect(await smallTargets(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toBe(0);
    const key = (await card.getByText(/^Key:/).textContent())!.replace('Key:', '').trim();
    expect(key).toMatch(/^[A-Z2-7]{32}$/);

    await card.getByLabel('Code from the app').fill(totpCode(key));
    await card.getByRole('button', { name: 'Link app' }).click();
    const codes = await takeRecoveryCodes(page);
    await expect(card.getByText('Linked', { exact: true })).toBeVisible();

    await ctx.clearCookies();
    await page.goto('/step-inside');
    await page.getByLabel('Handle or email').fill(me.email);
    await page.getByLabel('Password').fill(me.password);
    await page.getByRole('button', { name: 'Step Inside' }).click();
    await expect(page.getByRole('heading', { name: 'One more step' })).toBeVisible();
    // The code that linked the app is spent: the next one works.
    await page.getByLabel('Code').fill(totpCode(key));
    await page.getByRole('button', { name: 'Step Inside' }).click();
    await expect(page.locator('main [role="alert"]')).toContainText('That code isn’t right');
    await page.getByLabel('Code').fill(totpCode(key, Date.now() + 30_000));
    await page.getByRole('button', { name: 'Step Inside' }).click();
    await expect(page).toHaveURL(/\/home$/);

    await ctx.clearCookies();
    await page.goto('/step-inside');
    await page.getByLabel('Handle or email').fill(me.handle);
    await page.getByLabel('Password').fill(me.password);
    await page.getByRole('button', { name: 'Step Inside' }).click();
    await page.getByLabel('Code').fill(codes[0]!.toUpperCase());
    await page.getByRole('button', { name: 'Step Inside' }).click();
    await expect(page).toHaveURL(/\/home$/);

    await page.goto('/workshop');
    await expect(securityCard(page).getByText('9 of 10 left', { exact: false })).toBeVisible();
    expect(problems).toEqual([]);
    await ctx.close();
  });
});
