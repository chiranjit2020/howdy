import { expect, test, type Browser } from '@playwright/test';
import sharp from 'sharp';
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

/** ADR-031: nail a Post Card with a photo from a 320 px phone; the photo shows on the card, and nothing leaks. */

async function person(browser: Browser, tag: string) {
  const account = uniqueAccount(tag);
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

const photo = () =>
  sharp({ create: { width: 2000, height: 1200, channels: 3, background: '#f4a261' } })
    .withExif({ IFD0: { Copyright: 'SECRET-COPYRIGHT-NOTE' } })
    .jpeg()
    .toBuffer();

test('Add a photo → preview → Nail: the card shows it, fits the phone, and the file is clean', async ({
  browser,
}) => {
  const me = await person(browser, 'cardphoto');
  const problems = await watchProblems(me.page);
  await me.page.goto(`/porch/${me.handle}?nail=1`);
  await pageReady(me.page);

  const chooser = me.page.locator('#nail input[type=file]');
  // Retried: a file picked before the page has hydrated fires no React handler.
  await expect(async () => {
    await chooser.setInputFiles({ name: 'sunset.jpg', mimeType: 'image/jpeg', buffer: await photo() });
    await expect(me.page.getByAltText('The photo you chose for this card')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(me.page.getByText('Uploading…')).toHaveCount(0, { timeout: 15_000 });
  expect(await smallTargets(me.page)).toEqual([]);

  await me.page.getByLabel('Nail a Post Card').fill('Sunset from the porch');
  await me.page.getByRole('button', { name: 'Nail to Fence' }).click();
  const card = me.page
    .getByRole('article', { name: /Post Card from/ })
    .filter({ hasText: 'Sunset from the porch' });
  const img = card.getByRole('img', { name: /Photo on this card/ });
  await expect(img).toBeVisible();
  // The browser really received the picture (it decoded to a size), and the composer is empty again.
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(me.page.getByAltText('The photo you chose for this card')).toHaveCount(0);

  const src = await img.getAttribute('src');
  const got = await me.page.request.get(src!);
  expect(got.status()).toBe(200);
  expect(got.headers()['content-type']).toBe('image/webp');
  expect((await got.body()).includes(Buffer.from('SECRET-COPYRIGHT-NOTE'))).toBe(false);

  expect(await horizontalOverflow(me.page)).toBe(0);
  expect(await axeViolations(me.page)).toEqual([]);
  expect(problems).toEqual([]);
  await me.ctx.close();
});
