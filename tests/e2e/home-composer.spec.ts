import { expect, test, type Browser } from '@playwright/test';
import sharp from 'sharp';
import {
  axeViolations,
  confirmEmailVia,
  newContext,
  pageReady,
  settleAccount,
  signUpVia,
  stepInsideVia,
  uniqueAccount,
  watchProblems,
} from './helpers';

/**
 * Home's "What's on your mind?": one line with a camera button until you click in, then the full box with Add a photo
 * and Post; it closes again when you leave it empty, and stays open while it holds words or a photo.
 */

async function person(browser: Browser, tag: string) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser, { viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await settleAccount(account.handle);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}

const photo = () =>
  sharp({ create: { width: 1200, height: 900, channels: 3, background: '#f8cf35' } })
    .jpeg()
    .toBuffer();

test('one line until clicked; opens, posts, closes again; a photo from the one-line camera opens it', async ({
  browser,
}) => {
  const me = await person(browser, 'mind');
  const page = me.page;
  const problems = await watchProblems(page);
  await pageReady(page);

  const box = page.getByLabel('What’s on your mind?');
  const post = page.getByRole('button', { name: 'Post', exact: true });
  const height = async () => (await box.boundingBox())!.height;

  // One line, the question inside it, and a camera button beside it; no Post button yet.
  await expect(box).toHaveAttribute('placeholder', 'What’s on your mind?');
  expect(await height()).toBeLessThanOrEqual(44);
  await expect(page.locator('label').filter({ hasText: 'Add a photo' })).toBeVisible();
  await expect(post).toHaveCount(0);

  // Clicking in opens it; leaving it empty closes it again.
  await box.click();
  await expect(post).toBeVisible();
  expect(await height()).toBeGreaterThan(44);
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('heading', { name: 'Friends’ posts' }).click();
  await expect(post).toHaveCount(0);

  // Words keep it open even after leaving it; posting puts the post in the feed.
  await box.click();
  await box.fill('Chai on the balcony');
  await page.getByRole('heading', { name: 'Friends’ posts' }).click();
  await expect(post).toBeVisible();
  await post.click();
  await expect(page.getByRole('article').filter({ hasText: 'Chai on the balcony' })).toBeVisible();
  await expect(box).toHaveValue('');

  // Back to one line; a photo chosen from the camera opens it, with the words box ready for a caption.
  await page.getByRole('heading', { name: 'Friends’ posts' }).click();
  await expect(post).toHaveCount(0);
  const preview = page.getByAltText('The photo you chose for this card');
  await expect(async () => {
    // Retried: a file picked before the page has hydrated fires no React handler.
    // This form's own picker (Home also has the Stories one).
    await page
      .locator('form')
      .filter({ has: box })
      .locator('input[type=file]')
      .setInputFiles({
        name: 'yellow.jpg',
        mimeType: 'image/jpeg',
        buffer: await photo(),
      });
    await expect(preview).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(box).toBeFocused();
  await expect(post).toBeVisible();

  expect(problems).toEqual([]);
  await me.ctx.close();
});
