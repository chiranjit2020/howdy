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
 * Home's "What's on your mind?": one borderless line until you click in, then the full box with Add a photo and Post;
 * it closes again when you leave it empty, and stays open while it holds words or a photo.
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

test('one line until clicked; opens, posts, closes again; a photo alone is a post', async ({
  browser,
}) => {
  const me = await person(browser, 'mind');
  const page = me.page;
  const problems = await watchProblems(page);
  await pageReady(page);

  const box = page.getByLabel('What’s on your mind?');
  const post = page.getByRole('button', { name: 'Post', exact: true });
  const height = async () => (await box.boundingBox())!.height;

  // One line, the question inside it with no border round it, and nothing beside it (2026-11-07: the camera beside the
  // closed line repeated the open box's Add a photo); no Post button yet.
  await expect(box).toHaveAttribute('placeholder', 'What’s on your mind?');
  expect(await height()).toBeLessThanOrEqual(44);
  expect(await box.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px');
  await expect(page.locator('form').filter({ has: box }).locator('label').filter({ hasText: 'Add a photo' })).toHaveCount(0);
  await expect(post).toHaveCount(0);

  // No friend has a Story, so there is no row for one lonely circle: my Story button leads the line, on its level.
  const story = page.getByRole('button', { name: 'Add to your Story' });
  await expect(story).toBeVisible();
  await expect(page.getByText('Your Story', { exact: true })).toHaveCount(0);
  const [s, b] = [(await story.boundingBox())!, (await box.boundingBox())!];
  expect(s.x + s.width).toBeLessThan(b.x);
  expect(Math.abs(s.y + s.height / 2 - (b.y + b.height / 2))).toBeLessThanOrEqual(2);
  expect(s.height).toBeGreaterThanOrEqual(43.5); // still a full touch target

  // Clicking in opens it; leaving it empty closes it again.
  await box.click();
  await expect(post).toBeVisible();
  expect(await height()).toBeGreaterThan(44);
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('heading', { name: 'What’s Going On?', exact: true }).click();
  await expect(post).toHaveCount(0);

  // Users' complaint (2026-11-07): open but still empty, "Add a photo" must open the picker. Pressing it used to blur
  // the empty box, which closed and took the button away mid-click. And while the picker shows, the window loses focus
  // (the box blurs again): the box must stay open, or the file input goes and the chosen photo is lost.
  await box.click();
  const addPhoto = page
    .locator('form')
    .filter({ has: box })
    .locator('label')
    .filter({ hasText: 'Add a photo' });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), addPhoto.click()]);
  await box.evaluate((el) => el.blur()); // what the window losing focus to the picker does
  await expect(post).toBeVisible();
  await chooser.setFiles({ name: 'first.jpg', mimeType: 'image/jpeg', buffer: await photo() });
  await expect(page.getByAltText('The photo you chose for this card')).toBeVisible();
  await page.getByRole('button', { name: 'Remove the photo' }).click();
  // (The Remove button vanishes with the photo while focused, so no blur says we left: step back in, then out.)
  await box.click();
  await page.getByRole('heading', { name: 'What’s Going On?', exact: true }).click();
  await expect(post).toHaveCount(0);

  // Words keep it open even after leaving it; posting puts the post in the feed.
  await box.click();
  await box.fill('Chai on the balcony');
  await page.getByRole('heading', { name: 'What’s Going On?', exact: true }).click();
  await expect(post).toBeVisible();
  await post.click();
  await expect(page.getByRole('article').filter({ hasText: 'Chai on the balcony' })).toBeVisible();
  await expect(box).toHaveValue('');

  // Back to one line; open it again and choose a photo: the words box is ready for a caption.
  await page.getByRole('heading', { name: 'What’s Going On?', exact: true }).click();
  await expect(post).toHaveCount(0);
  const preview = page.getByAltText('The photo you chose for this card');
  await expect(async () => {
    // Retried: a file picked before the page has hydrated fires no React handler.
    // This form's own picker (Home also has the Stories one).
    await box.click();
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

  // Most people post the photo alone (2026-11-07): with no caption, Post works once the photo has uploaded, and the
  // post is just the photo.
  await expect(post).toBeEnabled();
  await post.click();
  const photoPost = page.getByRole('article', { name: /Post from/ }).first();
  await expect(
    photoPost.getByRole('button', { name: /^Photo on this (post|card) from/ }).locator('img'),
  ).toBeVisible();
  await expect(preview).toHaveCount(0);
  await expect(box).toHaveValue('');

  expect(problems).toEqual([]);
  await me.ctx.close();
});
