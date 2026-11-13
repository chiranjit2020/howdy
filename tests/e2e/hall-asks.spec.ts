import { expect, test, type Browser } from '@playwright/test';
import {
  axeViolations,
  confirmEmailVia,
  horizontalOverflow,
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
  await settleAccount(account.handle);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}
type Person = Awaited<ReturnType<typeof person>>;

const api = (p: Person, path: string, data: unknown) =>
  p.page.request.fetch(path, { method: 'POST', data, headers: { origin: ORIGIN } });

/** ADR-065: a member asks "Buy or wait?"; another answers with a reason; the asker adds an update and decides. */
test('ask "Buy or wait?", a member answers with a reason, the asker updates and decides', async ({
  browser,
}) => {
  test.slow(); // two people sign up
  const owner = await person(browser, 'askowner');
  const ann = await person(browser, 'askmember', { viewport: { width: 360, height: 780 }, isMobile: true });
  const made = await api(owner, '/api/town-halls', {
    name: `Flat ${Date.now().toString(36)}`,
    description: 'Rent, groceries, gossip.',
    visibility: 'open',
  });
  const id = ((await made.json()) as { townHall: { id: string } }).townHall.id;
  expect((await api(ann, `/api/town-halls/${id}`, { action: 'join' })).ok()).toBe(true);
  const problems = await watchProblems(owner.page);

  await owner.page.goto(`/groups/${id}`);
  await pageReady(owner.page);
  await owner.page.getByRole('button', { name: 'Buy or wait?' }).click();
  const dialog = owner.page.getByRole('dialog', { name: 'Buy or wait?' });
  await dialog.getByLabel('What do you want to buy?').fill('Noise-cancelling headphones');
  await dialog.getByLabel('Price').fill('12499');
  await dialog.getByLabel('Why do you want it?').fill('My commute is 90 minutes of traffic noise.');
  await dialog.getByLabel('Or I could…').fill('Keep my old earphones');
  expect(await axeViolations(owner.page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Ask the group' }).click();
  await expect(owner.page.getByRole('status').filter({ hasText: 'Asked.' })).toBeVisible();
  const ownersAsk = owner.page.getByRole('region', { name: 'Buy or wait: Noise-cancelling headphones' });
  await expect(ownersAsk).toContainText('₹12,499');
  await expect(ownersAsk).toContainText('No answers yet.');

  // Ann (on a phone) answers Wait with a reason; it sticks after a reload.
  await ann.page.goto(`/groups/${id}`);
  await pageReady(ann.page);
  const anns = ann.page.getByRole('region', { name: 'Buy or wait: Noise-cancelling headphones' });
  await anns.getByRole('button', { name: 'Wait' }).click();
  await anns.getByLabel('Why wait?').fill('Diwali sale is two weeks away');
  await anns.getByRole('button', { name: 'Send answer' }).click();
  await expect(anns).toContainText('You said Wait');
  await expect(anns).toContainText('0 say buy · 1 say wait');
  expect(await horizontalOverflow(ann.page)).toBe(0);
  expect(await axeViolations(ann.page)).toEqual([]);
  await ann.page.reload();
  await pageReady(ann.page);
  await expect(anns).toContainText('Diwali sale is two weeks away');

  // The asker sees Ann's name and reason, adds the one update, then decides: answers close.
  await owner.page.reload();
  await pageReady(owner.page);
  await expect(ownersAsk).toContainText('Diwali sale is two weeks away');
  await ownersAsk.getByRole('button', { name: 'Add an update' }).click();
  await ownersAsk.getByLabel('Your one update').fill('Fair. I will wait for the sale.');
  await ownersAsk.getByRole('button', { name: 'Post update' }).click();
  await expect(ownersAsk).toContainText('Update: Fair. I will wait for the sale.');
  await expect(ownersAsk.getByRole('button', { name: 'Add an update' })).toHaveCount(0);
  await ownersAsk.getByRole('button', { name: 'I’ve decided' }).click();
  await ownersAsk.getByRole('button', { name: 'Still waiting' }).click();
  await expect(ownersAsk).toContainText('Decided: waiting for now.');

  await ann.page.reload();
  await pageReady(ann.page);
  await expect(anns).toContainText('Decided: waiting for now.');
  await expect(anns.getByRole('button', { name: 'Change' })).toHaveCount(0);

  expect(problems).toEqual([]);
  await Promise.all([owner.ctx.close(), ann.ctx.close()]);
});
