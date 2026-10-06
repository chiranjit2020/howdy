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

/** ADR-046: post a photo in a Town Hall from a phone; another member sees it, and the file is clean. */

const PHONE = { hasTouch: true, isMobile: true, viewport: { width: 320, height: 720 } };

async function person(browser: Browser, tag: string) {
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

const photo = () =>
  sharp({ create: { width: 2000, height: 1200, channels: 3, background: '#b7e4c7' } })
    .withExif({ IFD0: { Copyright: 'SECRET-HALL-NOTE' } })
    .jpeg()
    .toBuffer();

test('a photo in a Town Hall post: chosen on a phone, seen by another member, no hidden data', async ({
  browser,
}) => {
  test.slow(); // two people signing up on phones
  const owner = await person(browser, 'hpowner');
  const ann = await person(browser, 'hpann');
  const problems = await watchProblems(owner.page);

  await owner.page.goto('/town-halls');
  await pageReady(owner.page);
  await owner.page.getByRole('button', { name: 'Start a Town Hall' }).click();
  await owner.page.getByLabel('Name').fill(`Photo Porch ${Date.now().toString(36)}`);
  await owner.page.getByLabel('What is it about?').fill('Pictures welcome.');
  await owner.page.getByRole('button', { name: 'Start it' }).click();
  await owner.page.getByRole('tab', { name: /^Mine/ }).click();
  const url = (await owner.page
    .getByRole('link', { name: /^Manage/ })
    .first()
    .getAttribute('href'))!;
  await ann.page.goto(url);
  await pageReady(ann.page);
  await ann.page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(ann.page.getByRole('button', { name: 'Leave' })).toBeVisible();

  // The owner picks a photo on their phone and posts it.
  await owner.page.goto(url);
  await pageReady(owner.page);
  const chooser = owner.page.locator('input[type=file]').first();
  // Retried: a file picked before the page has hydrated fires no React handler.
  await expect(async () => {
    await chooser.setInputFiles({ name: 'garden.jpg', mimeType: 'image/jpeg', buffer: await photo() });
    await expect(owner.page.getByAltText('The photo you chose for this post')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(owner.page.getByText('Uploading…')).toHaveCount(0, { timeout: 15_000 });
  await owner.page.getByLabel('Post to this Town Hall').fill('The garden this morning');
  await owner.page.getByRole('button', { name: 'Post', exact: true }).click();
  const mine = owner.page.getByRole('img', { name: /Photo on this post from/ });
  await expect(mine).toBeVisible();
  await expect.poll(() => mine.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  // Another member sees it; the file is a clean WebP.
  await ann.page.reload();
  await pageReady(ann.page);
  const theirs = ann.page.getByRole('img', { name: /Photo on this post from/ });
  await expect(theirs).toBeVisible();
  await expect.poll(() => theirs.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const got = await ann.page.request.get((await theirs.getAttribute('src'))!);
  expect(got.status()).toBe(200);
  expect(got.headers()['content-type']).toBe('image/webp');
  expect((await got.body()).includes(Buffer.from('SECRET-HALL-NOTE'))).toBe(false);

  expect(await axeViolations(ann.page)).toEqual([]);
  expect(await smallTargets(ann.page)).toEqual([]);
  expect(await horizontalOverflow(ann.page)).toBe(0);
  expect(problems).toEqual([]);
  for (const p of [owner, ann]) await p.ctx.close();
});
