import { expect, test, type Browser } from '@playwright/test';
import sharp from 'sharp';
import {
  axeViolations,
  confirmEmailVia,
  newContext,
  pageReady,
  signUpVia,
  stepInsideVia,
  uniqueAccount,
  watchProblems,
} from './helpers';

/** ADR-051: change your cover on your profile — one of Howdy's covers, or a photo — and a friend sees it too. */

const ORIGIN = 'http://localhost:3300';

async function person(browser: Browser, tag: string) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser, { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}

const photo = () =>
  sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#bee1e6' } })
    .withExif({ IFD0: { Copyright: 'SECRET-COVER-NOTE' } })
    .jpeg()
    .toBuffer();

test('pick a Howdy cover, then upload a cover photo a friend also sees; picking a Howdy cover again removes it', async ({
  browser,
}) => {
  test.slow(); // two people sign up
  const owner = await person(browser, 'cover');
  const friend = await person(browser, 'cfriend');
  const act = (p: typeof owner, handle: string, action: string) =>
    p.page.request.fetch(`/api/relationships/${handle}`, {
      method: 'POST',
      data: { action },
      headers: { origin: ORIGIN },
    });
  expect((await act(owner, friend.handle, 'request')).ok()).toBe(true);
  expect((await act(friend, owner.handle, 'accept')).ok()).toBe(true);
  const problems = await watchProblems(owner.page);

  await owner.page.goto(`/profile/${owner.handle}`);
  await pageReady(owner.page);
  const open = () => owner.page.getByRole('button', { name: 'Change cover' }).click();
  const dialog = owner.page.getByRole('dialog', { name: 'Your cover' });

  // The porch illustration to start with; pick Dusk.
  await open();
  await expect(dialog.getByRole('radio', { name: 'Porch' })).toHaveAttribute('aria-checked', 'true');
  expect(await axeViolations(owner.page)).toEqual([]);
  await dialog.getByRole('radio', { name: 'Dusk' }).click();
  await expect(owner.page.getByText('Cover: Dusk.')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Dusk' })).toHaveAttribute('aria-checked', 'true');

  // Upload a photo: it becomes the cover (served by our own route), and no Howdy cover is marked any more.
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'sky.jpg',
    mimeType: 'image/jpeg',
    buffer: await photo(),
  });
  await expect(owner.page.getByText('Cover updated.')).toBeVisible();
  const coverImg = (p: typeof owner) => p.page.locator('main img[src^="/api/covers/"]').first();
  await expect(coverImg(owner)).toBeVisible();
  await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(0);
  await owner.page.keyboard.press('Escape');

  // The file is a clean 1600x560 WebP (no camera data).
  const src = (await coverImg(owner).getAttribute('src'))!;
  const got = await owner.page.request.get(src);
  expect(got.headers()['content-type']).toBe('image/webp');
  const body = await got.body();
  expect(body.includes(Buffer.from('SECRET-COVER-NOTE'))).toBe(false);
  expect(await sharp(body).metadata()).toMatchObject({ width: 1600, height: 560 });

  // A friend sees the same cover photo.
  await friend.page.goto(`/profile/${owner.handle}`);
  await expect(coverImg(friend)).toBeVisible();
  await expect(friend.page.getByRole('button', { name: 'Change cover' })).toHaveCount(0);

  // Picking a Howdy cover again removes the photo, so what was picked is what shows.
  await open();
  await dialog.getByRole('radio', { name: 'Meadow' }).click();
  await expect(owner.page.getByText('Cover: Meadow.')).toBeVisible();
  await expect(coverImg(owner)).toHaveCount(0);

  expect(problems).toEqual([]);
  for (const p of [owner, friend]) await p.ctx.close();
});
