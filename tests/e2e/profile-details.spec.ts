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
 * Personal details on a profile: added on your own profile in four short steps (About you, Personal, Contact, Social),
 * each detail with its own audience, and each viewer sees exactly the ones meant for them (decided on the server).
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

  // The owner adds details, step by step: where they live for everyone on Howdy, work for friends (the default),
  // birthday for themselves only, a website for everyone, an email (friends at most) and an Instagram handle.
  await owner.page.goto(`/profile/${owner.handle}`);
  await pageReady(owner.page);
  // The intro line inside the profile card: on your own profile it ends with Add details / Edit details.
  const card = owner.page.getByRole('region', { name: 'Details' });
  await card.getByRole('button', { name: 'Add details' }).click();
  const dialog = owner.page.getByRole('dialog', { name: 'Your details' });
  await dialog.getByLabel('Lives in').fill('Kolkata');
  await dialog.getByLabel('Who sees where you live').selectOption('members');
  await dialog.getByLabel('Work', { exact: true }).fill('Teacher at a school');
  expect(await axeViolations(owner.page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByLabel('Day', { exact: true }).selectOption('12');
  await dialog.getByLabel('Month', { exact: true }).selectOption('3');
  await dialog.getByLabel('Who sees your birthday').selectOption('only_me');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByLabel('Website', { exact: true }).fill('example.com/teach');
  await dialog.getByLabel('Who sees your website').selectOption('members');
  await dialog.getByLabel('Email', { exact: true }).fill('Owner@Example.com');
  // A phone number or email is for friends or only you: "Everyone" is not even offered.
  await expect(dialog.getByLabel('Who sees your email').locator('option')).toHaveText(['Friends', 'Only me']);
  expect(await axeViolations(owner.page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByLabel('Instagram').fill('https://www.instagram.com/owner.teaches/');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();

  // The owner sees all three, each with who sees it.
  // For everyone on Howdy: no marker (it needs no reminder); friends only and only me are marked.
  await expect(card).toContainText('Lives in Kolkata');
  await expect(card).not.toContainText('Everyone on Howdy');
  await expect(card).toContainText('Teacher at a school · Friends');
  await expect(card).toContainText('12 March · Only me');
  await expect(card.getByRole('button', { name: 'Edit details' })).toBeVisible();
  // Links to other sites open in a new tab, with no referrer; a pasted Instagram link became its handle.
  const site = card.getByRole('link', { name: /example\.com\/teach/ });
  await expect(site).toHaveAttribute('href', 'https://example.com/teach');
  await expect(site).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
  await expect(site).toHaveAttribute('target', '_blank');
  await expect(card.getByRole('link', { name: /owner\.teaches/ })).toHaveAttribute(
    'href',
    'https://www.instagram.com/owner.teaches/',
  );

  // A friend: where they live and their work; never the birthday; no audiences, no edit button.
  await friend.page.goto(`/profile/${owner.handle}`);
  const seenByFriend = friend.page.getByRole('region', { name: 'Details' });
  await expect(seenByFriend).toContainText('Kolkata');
  await expect(seenByFriend).toContainText('Teacher at a school');
  await expect(seenByFriend).not.toContainText('12 March');
  await expect(seenByFriend).not.toContainText('Everyone on Howdy');
  await expect(seenByFriend.getByRole('link', { name: 'owner@example.com' })).toHaveAttribute(
    'href',
    'mailto:owner@example.com',
  );
  await expect(seenByFriend.getByRole('button')).toHaveCount(0);

  // A stranger: only what is for everyone on Howdy.
  await stranger.page.goto(`/profile/${owner.handle}`);
  const seenByStranger = stranger.page.getByRole('region', { name: 'Details' });
  await expect(seenByStranger).toContainText('Kolkata');
  await expect(seenByStranger).not.toContainText('Teacher at a school');
  await expect(seenByStranger).not.toContainText('12 March');
  await expect(seenByStranger).toContainText('example.com/teach');
  await expect(seenByStranger).not.toContainText('owner@example.com');
  await expect(seenByStranger).not.toContainText('owner.teaches');

  // A link is refused, on its field, and nothing changes.
  await owner.page.getByRole('button', { name: 'Edit details' }).click();
  await dialog.getByLabel('Work', { exact: true }).fill('Hire me at example.com');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByText(/Links are not allowed/)).toBeVisible();
  // Still on the same step: a refused step never moves on.
  await expect(dialog.getByRole('button', { name: /About you/ })).toHaveAttribute('aria-current', 'step');
  await owner.page.keyboard.press('Escape');
  await owner.page.reload();
  await expect(card).toContainText('Teacher at a school');

  expect(problems).toEqual([]);
  for (const p of [owner, friend, stranger]) await p.ctx.close();
});
