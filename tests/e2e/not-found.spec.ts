import { expect, test } from '@playwright/test';
import { confirmEmailVia, newContext, signUpVia, stepInsideVia, uniqueAccount } from './helpers';

/**
 * Pages with a loading outline decide "not found" in a layout, before the outline streams, so the HTTP status is a real
 * 404 (not a 200 with a not-found page inside). Hidden pages are covered in fence/ranch/relationships/whispers specs.
 */
test('made-up Porches, Whisper threads and Town Halls answer a real 404; real ones still open', async ({
  browser,
}) => {
  const a = uniqueAccount('lost');
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await signUpVia(page, a);
  await confirmEmailVia(page, a.email);
  await stepInsideVia(page, a.email, a.password);
  await expect(page).toHaveURL(/\/home$/);

  for (const path of [
    '/porch/nobody_home_here',
    '/whispers/nobody_home_here',
    '/town-halls/00000000-0000-4000-8000-000000000000',
    '/town-halls/not-a-real-id',
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }

  expect((await page.goto(`/porch/${a.handle}`))?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: a.handle })).toBeVisible();
  await ctx.close();
});
