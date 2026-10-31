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
 * Personal details on a profile: added on your own profile in the Details card, each with its own audience, and each
 * viewer sees exactly the ones meant for them (decided on the server).
 */

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
type Person = Awaited<ReturnType<typeof person>>;

const act = (p: Person, handle: string, action: string) =>
  p.page.request.fetch(`/api/relationships/${handle}`, {
    method: 'POST',
    data: { action },
    headers: { origin: ORIGIN },
  });

test('add details with their own audiences; a friend, a stranger and the owner each see their share', async ({
  browser,
}) => {
  test.slow(); // three people sign up
  const owner = await person(browser, 'details');
  const friend = await person(browser, 'dfriend');
  const stranger = await person(browser, 'dstranger');
  expect((await act(owner, friend.handle, 'request')).ok()).toBe(true);
  expect((await act(friend, owner.handle, 'accept')).ok()).toBe(true);
  const problems = await watchProblems(owner.page);

  // The owner adds three details: where they live for everyone on Howdy, work for friends (the default), birthday
  // for themselves only.
  await owner.page.goto(`/profile/${owner.handle}`);
  await pageReady(owner.page);
  const card = owner.page.getByRole('region', { name: 'Details' });
  await card.getByRole('button', { name: 'Add details' }).click();
  const dialog = owner.page.getByRole('dialog', { name: 'Your details' });
  await dialog.getByLabel('Lives in').fill('Kolkata');
  await dialog.getByLabel('Who sees where you live').selectOption('members');
  await dialog.getByLabel('Work', { exact: true }).fill('Teacher at a school');
  await dialog.getByLabel('Day', { exact: true }).selectOption('12');
  await dialog.getByLabel('Month', { exact: true }).selectOption('3');
  await dialog.getByLabel('Who sees your birthday').selectOption('only_me');
  expect(await axeViolations(owner.page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();

  // The owner sees all three, each with who sees it.
  await expect(card).toContainText('Kolkata · Everyone on Howdy');
  await expect(card).toContainText('Teacher at a school · Friends');
  await expect(card).toContainText('12 March · Only me');
  await expect(card.getByRole('button', { name: 'Edit details' })).toBeVisible();

  // A friend: where they live and their work; never the birthday; no audiences, no edit button.
  await friend.page.goto(`/profile/${owner.handle}`);
  const seenByFriend = friend.page.getByRole('region', { name: 'Details' });
  await expect(seenByFriend).toContainText('Kolkata');
  await expect(seenByFriend).toContainText('Teacher at a school');
  await expect(seenByFriend).not.toContainText('12 March');
  await expect(seenByFriend).not.toContainText('Everyone on Howdy');
  await expect(seenByFriend.getByRole('button')).toHaveCount(0);

  // A stranger: only what is for everyone on Howdy.
  await stranger.page.goto(`/profile/${owner.handle}`);
  const seenByStranger = stranger.page.getByRole('region', { name: 'Details' });
  await expect(seenByStranger).toContainText('Kolkata');
  await expect(seenByStranger).not.toContainText('Teacher at a school');
  await expect(seenByStranger).not.toContainText('12 March');

  // A link is refused, on its field, and nothing changes.
  await owner.page.getByRole('button', { name: 'Edit details' }).click();
  await dialog.getByLabel('Work', { exact: true }).fill('Hire me at example.com');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByText(/Links are not allowed/)).toBeVisible();
  await owner.page.keyboard.press('Escape');
  await owner.page.reload();
  await expect(card).toContainText('Teacher at a school');

  expect(problems).toEqual([]);
  for (const p of [owner, friend, stranger]) await p.ctx.close();
});
