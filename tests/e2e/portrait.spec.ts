import { expect, test, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
  confirmEmailVia,
  newContext,
  signUpVia,
  stepInsideVia,
  uniqueAccount,
  watchProblems,
} from './helpers';

async function person(browser: Browser, tag: string) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}

/** A photo carrying a location and a copyright note (which must not come back out). */
const photo = () =>
  sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#8fb8ff' } })
    .withExif({ IFD0: { Copyright: 'SECRET-COPYRIGHT-NOTE' }, IFD3: { GPSLatitudeRef: 'N' } })
    .jpeg()
    .toBuffer();

/**
 * Portrait images on the page: how many are in it, and whether every one on screen really decoded at 512 px. Hidden ones
 * (the phone tab bar's, on a wide screen) are lazy and may never load, so they count but are not waited for.
 */
const portraits = (page: Page) =>
  page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].filter((i) => i.src.includes('/api/portraits/'));
    const shown = imgs.filter((i) => i.getClientRects().length > 0);
    return {
      count: imgs.length,
      decoded: shown.length > 0 && shown.every((i) => i.complete && i.naturalWidth === 512),
    };
  });

test.describe('Portrait (production build, real CSP, local file storage)', () => {
  test('upload, see it everywhere it belongs, keep it private, remove it', async ({ browser }) => {
    const a = await person(browser, 'shutter');
    const b = await person(browser, 'viewer');
    const problems = await watchProblems(a.page);

    // A wrong kind of file is refused in the browser, and nothing is stored.
    await a.page.goto('/workshop');
    const chooser = a.page.locator('input[type=file]');
    await chooser.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(a.page.getByText('Choose a JPEG, PNG or WebP photo.')).toBeVisible();
    expect((await portraits(a.page)).count).toBe(0);

    // A real photo goes straight to storage, is decoded on the server, and shows up.
    await chooser.setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: await photo() });
    await expect(a.page.getByRole('status').filter({ hasText: 'Portrait updated.' })).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(async () => (await portraits(a.page)).decoded, { timeout: 15_000 }).toBe(true);
    await expect(a.page.getByRole('button', { name: 'Remove photo' })).toBeVisible();

    // It is a clean 512x512 WebP with nothing hidden in it, and always re-checked (never blindly cached).
    const src = await a.page.locator('img[src*="/api/portraits/"]').first().getAttribute('src');
    const got = await a.page.request.get(src!);
    expect(got.status()).toBe(200);
    expect(got.headers()['content-type']).toBe('image/webp');
    expect(got.headers()['cache-control']).toBe('private, no-cache');
    expect((await got.body()).includes(Buffer.from('SECRET-COPYRIGHT-NOTE'))).toBe(false);
    expect(await got.body().then((body) => sharp(body).metadata())).toMatchObject({
      width: 512,
      height: 512,
    });

    // On the Ranch: in the top bar, in the header, and on the phone tab bar's Porch tab (in the page even where it is hidden).
    await a.page.goto(`/porch/${a.handle}`);
    await expect.poll(async () => (await portraits(a.page)).count).toBe(3);
    await expect.poll(async () => (await portraits(a.page)).decoded, { timeout: 15_000 }).toBe(true);

    // Another member who may open the Ranch sees it; a signed-out visitor gets nothing.
    await b.page.goto(`/porch/${a.handle}`);
    await expect.poll(async () => (await portraits(b.page)).decoded).toBe(true);
    const anon = await newContext(browser);
    expect((await anon.request.get(src!)).status()).toBe(404);
    await anon.close();

    // Hide the Ranch from non-Posse members: the photo goes with it, at the very next request.
    await a.page.goto('/workshop');
    await a.page.getByLabel('Who can visit your Porch?').selectOption('posse');
    await a.page.getByRole('button', { name: 'Save Boundary Lines' }).click();
    await expect(a.page.getByRole('status').filter({ hasText: 'Boundary Lines updated' })).toBeVisible();
    expect((await b.page.request.get(src!)).status()).toBe(404);

    // Remove it: the initials come back and the address stops working.
    await a.page.goto('/workshop');
    await a.page.getByRole('button', { name: 'Remove photo' }).click();
    await expect(a.page.getByRole('status').filter({ hasText: 'Portrait removed.' })).toBeVisible();
    await expect.poll(async () => (await portraits(a.page)).count).toBe(0);
    expect((await a.page.request.get(src!)).status()).toBe(404);

    expect(problems).toEqual([]); // no CSP violations, console errors or 5xx along the way
    await a.ctx.close();
    await b.ctx.close();
  });
});
