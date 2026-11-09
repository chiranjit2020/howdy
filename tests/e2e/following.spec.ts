import { expect, test, type Browser } from '@playwright/test';
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

/**
 * ADR-053: following someone you are not friends with brings what they write on their own wall to your Home. Offered only
 * where you may read that wall; friends get Close friend instead. Since ADR-062 everyone sees the numbers, never who.
 */

const ORIGIN = 'http://localhost:3300';

async function person(browser: Browser, tag: string, opts: Parameters<typeof newContext>[1] = {}) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser, opts);
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}
type Person = Awaited<ReturnType<typeof person>>;

const api = (p: Person, path: string, data: unknown) =>
  p.page.request.fetch(path, { method: 'POST', data, headers: { origin: ORIGIN } });

async function makePals(asker: Person, asked: Person) {
  expect((await api(asker, `/api/relationships/${asked.handle}`, { action: 'request' })).ok()).toBe(true);
  expect((await api(asked, `/api/relationships/${asker.handle}`, { action: 'accept' })).ok()).toBe(true);
}

test('follow someone from their profile: their own posts reach Home, and everyone sees the numbers', async ({
  browser,
}) => {
  test.slow(); // three people sign up
  const star = await person(browser, 'star');
  const fan = await person(browser, 'fan');
  const pal = await person(browser, 'starpal');
  await makePals(pal, star);
  expect(
    (await api(star, `/api/porch/${star.handle}/fence`, { body: 'Morning nets, then breakfast.' })).ok(),
  ).toBe(true);
  expect((await api(pal, `/api/porch/${star.handle}/fence`, { body: 'Great knock yesterday!' })).ok()).toBe(
    true,
  );
  const problems = await watchProblems(fan.page);

  await fan.page.goto(`/profile/${star.handle}`);
  await pageReady(fan.page);
  const follow = fan.page.getByRole('button', { name: /^Follow/ });
  await expect(follow).toHaveText('Follow');
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  await expect(follow).toHaveText('Following');
  expect(await axeViolations(fan.page)).toEqual([]);

  await fan.page.goto('/home');
  await pageReady(fan.page);
  const posts = fan.page.getByRole('region', { name: 'What’s Going On?', exact: true });
  await expect(posts.getByText('Morning nets, then breakfast.')).toBeVisible();
  await expect(posts.getByText('Great knock yesterday!')).toHaveCount(0);

  // A friend gets Close friend, not Follow.
  await pal.page.goto(`/profile/${star.handle}`);
  await pageReady(pal.page);
  await expect(pal.page.getByRole('switch', { name: 'Close friend' })).toBeVisible();
  await expect(pal.page.getByRole('button', { name: /^Follow/ })).toHaveCount(0);

  // The numbers are for everyone (ADR-062): the owner, a friend and a follower see the same two figures. The friend
  // number links to the Friends page only on your own profile.
  await star.page.goto(`/profile/${star.handle}`);
  await pageReady(star.page);
  await expect(star.page.getByText('1 follower')).toBeVisible();
  await expect(star.page.getByRole('link', { name: '1 friend' })).toBeVisible();
  for (const viewer of [fan, pal]) {
    await viewer.page.goto(`/profile/${star.handle}`);
    await pageReady(viewer.page);
    await expect(viewer.page.getByText('1 follower')).toBeVisible();
    await expect(viewer.page.getByText('1 friend', { exact: true })).toBeVisible();
    await expect(viewer.page.getByRole('link', { name: '1 friend' })).toHaveCount(0);
  }

  expect(problems).toEqual([]);
  await Promise.all([star, fan, pal].map((p) => p.ctx.close()));
});

test('no Follow where it would bring nothing: a wall only friends may read', async ({ browser }) => {
  const star = await person(browser, 'private');
  const fan = await person(browser, 'nofan');
  const r = await star.page.request.fetch('/api/me/porch', {
    method: 'PATCH',
    data: { fenceVisibility: 'posse' },
    headers: { origin: ORIGIN },
  });
  expect(r.ok()).toBe(true);
  await fan.page.goto(`/profile/${star.handle}`);
  await pageReady(fan.page);
  await expect(fan.page.getByRole('button', { name: 'Add friend' })).toBeVisible();
  await expect(fan.page.getByRole('button', { name: /^Follow/ })).toHaveCount(0);
  await Promise.all([star.ctx.close(), fan.ctx.close()]);
});
