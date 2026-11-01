import { expect, test, type Browser } from '@playwright/test';
import {
  axeViolations,
  confirmEmailVia,
  newContext,
  pageReady,
  signUpVia,
  settleAccount,
  stepInsideVia,
  uniqueAccount,
  watchProblems,
} from './helpers';

const ORIGIN = 'http://localhost:3300';

async function person(browser: Browser, tag: string, opts: Parameters<typeof newContext>[1] = {}) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser, opts);
  const page = await ctx.newPage();
  await signUpVia(page, account);
  // Past the first week: these tests start more than one Town Hall per person (ADR-024 allows a new account one a day).
  await settleAccount(account.handle);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}
type Person = Awaited<ReturnType<typeof person>>;

const api = (p: Person, path: string, data: unknown) =>
  p.page.request.fetch(path, { method: 'POST', data, headers: { origin: ORIGIN } });

/** ADR-055: the owner or a Deputy pins one post to the top of a group's feed; members see it there, labelled. */
test('pin a notice from the post menu: it leads the feed for members; unpin puts it back', async ({
  browser,
}) => {
  test.slow(); // two people sign up
  const owner = await person(browser, 'pinowner');
  const ann = await person(browser, 'pinmember');
  const made = await api(owner, '/api/town-halls', {
    name: `Batch ${Date.now().toString(36)}`,
    description: 'Reunions and old jokes.',
    visibility: 'open',
  });
  const id = ((await made.json()) as { townHall: { id: string } }).townHall.id;
  expect((await api(ann, `/api/town-halls/${id}`, { action: 'join' })).ok()).toBe(true);
  await api(owner, `/api/town-halls/${id}/posts`, { body: 'Reunion on 14 December, college canteen, 6 pm.' });
  await api(ann, `/api/town-halls/${id}/posts`, { body: 'Count me in!' });
  const problems = await watchProblems(owner.page);

  await owner.page.goto(`/groups/${id}`);
  await pageReady(owner.page);
  await owner.page.getByRole('button', { name: `More about this post from @${owner.handle}` }).click();
  await owner.page.getByRole('menuitem', { name: 'Pin to top' }).click();
  await expect(owner.page.getByRole('status').filter({ hasText: 'Pinned to the top.' })).toBeVisible();

  // Ann sees it first, labelled, even though her post is newer; she has no Pin in her menu.
  await ann.page.goto(`/groups/${id}`);
  await pageReady(ann.page);
  const first = ann.page.getByRole('article', { name: /^Post from / }).first();
  await expect(first).toContainText('Reunion on 14 December');
  await expect(first).toContainText('Pinned');
  await ann.page.getByRole('button', { name: `More about this post from @${owner.handle}` }).click();
  await expect(ann.page.getByRole('menuitem', { name: /Pin to top|Unpin/ })).toHaveCount(0);
  await ann.page.keyboard.press('Escape');
  expect(await axeViolations(ann.page)).toEqual([]);

  // Unpinned: newest first again.
  await owner.page.getByRole('button', { name: `More about this post from @${owner.handle}` }).click();
  await owner.page.getByRole('menuitem', { name: 'Unpin' }).click();
  await ann.page.reload();
  await pageReady(ann.page);
  await expect(ann.page.getByRole('article', { name: /^Post from / }).first()).toContainText('Count me in!');
  await expect(ann.page.getByText('Pinned', { exact: true })).toHaveCount(0);

  expect(problems).toEqual([]);
  await Promise.all([owner.ctx.close(), ann.ctx.close()]);
});
