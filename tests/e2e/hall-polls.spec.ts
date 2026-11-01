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

/** ADR-057: any member asks a poll; members vote and change; everyone sees counts, nobody sees who; the asker closes it. */
test('ask a poll from the dialog, a member votes and changes, the asker closes it', async ({ browser }) => {
  test.slow(); // two people sign up
  const owner = await person(browser, 'pollowner');
  const ann = await person(browser, 'pollmember');
  const made = await api(owner, '/api/town-halls', {
    name: `Batch ${Date.now().toString(36)}`,
    description: 'Reunions and old jokes.',
    visibility: 'open',
  });
  const id = ((await made.json()) as { townHall: { id: string } }).townHall.id;
  expect((await api(ann, `/api/town-halls/${id}`, { action: 'join' })).ok()).toBe(true);
  const problems = await watchProblems(owner.page);

  await owner.page.goto(`/groups/${id}`);
  await pageReady(owner.page);
  await owner.page.getByRole('button', { name: 'New poll' }).click();
  const dialog = owner.page.getByRole('dialog', { name: 'New poll' });
  await dialog.getByLabel('Question').fill('Which date for the reunion?');
  await dialog.getByLabel('Option 1').fill('14 Dec');
  await dialog.getByLabel('Option 2').fill('21 Dec');
  await dialog.getByRole('button', { name: 'Add an option' }).click();
  await dialog.getByLabel('Option 3').fill('28 Dec');
  expect(await axeViolations(owner.page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Post poll' }).click();
  await expect(owner.page.getByRole('status').filter({ hasText: 'Poll posted.' })).toBeVisible();

  // Ann votes 14 Dec, then changes to 21 Dec; it sticks after a reload.
  await ann.page.goto(`/groups/${id}`);
  await pageReady(ann.page);
  const poll = ann.page.getByRole('region', { name: 'Poll: Which date for the reunion?' });
  await poll.getByRole('button', { name: /^14 Dec/ }).click();
  await expect(poll.getByRole('button', { name: /^14 Dec/ })).toHaveAttribute('aria-pressed', 'true');
  await poll.getByRole('button', { name: /^21 Dec/ }).click();
  await expect(poll.getByRole('button', { name: /^21 Dec/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(poll.getByRole('button', { name: /^21 Dec/ })).toContainText('100%');
  await ann.page.reload();
  await pageReady(ann.page);
  await expect(poll.getByRole('button', { name: /^21 Dec/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(poll).toContainText('1 vote');
  await expect(poll.getByRole('button', { name: 'Close poll' })).toHaveCount(0);
  expect(await axeViolations(ann.page)).toEqual([]);

  // The asker closes it: final results, and Ann can no longer vote.
  await owner.page.reload();
  await pageReady(owner.page);
  const ownersPoll = owner.page.getByRole('region', { name: 'Poll: Which date for the reunion?' });
  await expect(ownersPoll).not.toContainText(ann.handle);
  await ownersPoll.getByRole('button', { name: 'Close poll' }).click();
  await expect(ownersPoll).toContainText('Final results');
  await ann.page.reload();
  await pageReady(ann.page);
  await expect(poll.getByRole('button', { name: /^14 Dec/ })).toBeDisabled();

  expect(problems).toEqual([]);
  await Promise.all([owner.ctx.close(), ann.ctx.close()]);
});
