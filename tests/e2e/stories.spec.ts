import { expect, test, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Pool } from 'pg';
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

/** ADR-047: share a Story from Home on a phone; a Pal opens it, reacts and replies; the author sees who viewed. */

const db = new Pool({ connectionString: parse(readFileSync('.env.local')).E2E_DATABASE_URL, max: 1 });
test.afterAll(async () => {
  await db.end();
});

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

/** Make two people Pals directly (the Pals flow has its own spec). */
const makePals = (a: string, b: string) =>
  db.query(
    `insert into posse_links (user_low, user_high, status, requested_by, responded_at)
     select least(x.id, y.id), greatest(x.id, y.id), 'accepted', x.id, now()
     from users x, users y where x.handle = $1 and y.handle = $2`,
    [a, b],
  );

const photo = () =>
  sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#d8b4e2' } })
    .withExif({ IFD0: { Copyright: 'SECRET-STORY-NOTE' } })
    .jpeg()
    .toBuffer();

test('a Story: shared from Home on a phone, opened by a Pal who reacts and replies, seen-by for the author', async ({
  browser,
}) => {
  test.slow(); // two people signing up on phones
  const owner = await person(browser, 'stown');
  const pal = await person(browser, 'stpal');
  await makePals(owner.handle, pal.handle);
  const problems = await watchProblems(owner.page);
  const palProblems = await watchProblems(pal.page);
  const caption = `sunset ${owner.handle.slice(-4)}`;

  // The owner adds a Story from Home.
  await owner.page.goto('/home');
  await pageReady(owner.page);
  await owner.page.getByRole('button', { name: 'Add to your Story' }).tap();
  const add = owner.page.getByRole('dialog', { name: 'Add to your Story' });
  const chooser = add.locator('input[type=file]');
  // Retried: a file picked before the page has hydrated fires no React handler.
  await expect(async () => {
    await chooser.setInputFiles({ name: 'sunset.jpg', mimeType: 'image/jpeg', buffer: await photo() });
    await expect(add.getByAltText('The photo you chose for your Story')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(add.getByText('Uploading…')).toHaveCount(0, { timeout: 15_000 });
  await add.getByLabel('Caption (optional)').fill(caption);
  expect(await axeViolations(owner.page)).toEqual([]);
  expect(await smallTargets(owner.page)).toEqual([]);
  expect(await horizontalOverflow(owner.page)).toBe(0);
  await add.getByRole('button', { name: 'Share to Story' }).tap();
  await expect(owner.page.getByText('Your Story is up for 12 hours.')).toBeVisible();
  await expect(owner.page.getByRole('button', { name: 'Your Story', exact: true })).toBeVisible();

  // The Pal sees a new ring on Home and opens it.
  await pal.page.goto('/home');
  await pageReady(pal.page);
  await pal.page.getByRole('button', { name: /’s Story, new$/ }).tap();
  const viewer = pal.page.getByRole('dialog', { name: /’s Story$/ });
  await viewer.getByRole('button', { name: 'Pause' }).tap();
  const img = viewer.getByRole('img', { name: `Story photo: ${caption}` });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const got = await pal.page.request.get((await img.getAttribute('src'))!);
  expect(got.status()).toBe(200);
  expect(got.headers()['content-type']).toBe('image/webp');
  expect((await got.body()).includes(Buffer.from('SECRET-STORY-NOTE'))).toBe(false);

  await viewer.getByRole('button', { name: 'Fire' }).tap();
  await expect(viewer.getByRole('button', { name: 'Fire' })).toHaveAttribute('aria-pressed', 'true');
  expect(await axeViolations(pal.page)).toEqual([]);
  expect(await smallTargets(pal.page)).toEqual([]);
  expect(await horizontalOverflow(pal.page)).toBe(0);

  // Reply opens a Whisper with the Story quoted in my box — nothing sent yet.
  await viewer.getByRole('link', { name: 'Reply in a Whisper' }).tap();
  await expect(pal.page).toHaveURL(new RegExp(`/whispers/${owner.handle}\\?draft=`));
  await pageReady(pal.page);
  await expect(pal.page.getByRole('textbox').last()).toHaveValue(`Replying to your Story (“${caption}”): `);

  // Back on Home the ring is no longer new.
  await pal.page.goto('/home');
  await pageReady(pal.page);
  await expect(pal.page.getByRole('button', { name: /’s Story$/ })).toBeVisible();

  // The author sees who viewed and how they reacted, and gets a Chime.
  await owner.page.goto('/home');
  await pageReady(owner.page);
  await owner.page.getByRole('button', { name: 'Your Story', exact: true }).tap();
  const mine = owner.page.getByRole('dialog', { name: 'Your Story' });
  await mine.getByRole('button', { name: 'Pause' }).tap();
  await mine.getByRole('button', { name: 'Seen by 1' }).tap();
  await expect(mine.getByRole('listitem')).toHaveCount(1);
  await expect(mine.getByRole('listitem')).toContainText(/reacted Fire/);
  await mine.getByRole('button', { name: 'Take this Story down' }).tap();
  await owner.page.getByRole('button', { name: 'Take it down' }).tap();
  await expect(owner.page.getByText('Story taken down.')).toBeVisible();
  await owner.page.goto('/chimes');
  await pageReady(owner.page);
  await expect(owner.page.getByText(/reacted to your Story\./)).toBeVisible();

  expect(problems).toEqual([]);
  expect(palProblems).toEqual([]);
  for (const p of [owner, pal]) await p.ctx.close();
});
