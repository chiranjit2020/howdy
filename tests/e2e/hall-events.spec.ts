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

/** ADR-056: any member posts an event; members answer; everyone sees how many, the organiser sees who. */
test('post an event from the dialog, a member answers Going, the organiser sees who', async ({ browser }) => {
  test.slow(); // two people sign up
  const owner = await person(browser, 'evowner');
  const ann = await person(browser, 'evmember');
  const made = await api(owner, '/api/town-halls', {
    name: `Batch ${Date.now().toString(36)}`,
    description: 'Reunions and old jokes.',
    visibility: 'open',
  });
  const id = ((await made.json()) as { townHall: { id: string } }).townHall.id;
  expect((await api(ann, `/api/town-halls/${id}`, { action: 'join' })).ok()).toBe(true);
  const problems = await watchProblems(owner.page);

  // The owner posts an event a week from now.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  );
  await owner.page.goto(`/groups/${id}`);
  await pageReady(owner.page);
  await owner.page.getByRole('button', { name: 'New event' }).click();
  const dialog = owner.page.getByRole('dialog', { name: 'New event' });
  await dialog.getByLabel('What’s happening?').fill('Reunion dinner');
  await dialog.getByLabel('Date').fill(day);
  await dialog.getByLabel('Time').fill('18:30');
  await dialog.getByLabel('Where (optional)').fill('College canteen');
  expect(await axeViolations(owner.page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Post event' }).click();
  await expect(owner.page.getByRole('status').filter({ hasText: 'Event posted.' })).toBeVisible();
  const ownersEvent = owner.page.getByRole('region', { name: 'Event: Reunion dinner' });
  await expect(ownersEvent).toContainText('6:30 pm');
  await expect(ownersEvent).toContainText('College canteen');
  await expect(ownersEvent).toContainText('0 going');

  // Ann answers Going; it sticks after a reload. She never sees who else answered.
  await ann.page.goto(`/groups/${id}`);
  await pageReady(ann.page);
  const annsEvent = ann.page.getByRole('region', { name: 'Event: Reunion dinner' });
  await annsEvent.getByRole('button', { name: 'Going' }).click();
  await expect(annsEvent.getByRole('button', { name: 'Going' })).toHaveAttribute('aria-pressed', 'true');
  await expect(annsEvent).toContainText('1 going');
  await ann.page.reload();
  await pageReady(ann.page);
  await expect(annsEvent.getByRole('button', { name: 'Going' })).toHaveAttribute('aria-pressed', 'true');
  await expect(annsEvent.getByText('Who answered')).toHaveCount(0);
  expect(await axeViolations(ann.page)).toEqual([]);

  // The organiser sees who.
  await owner.page.reload();
  await pageReady(owner.page);
  await ownersEvent.getByText('Who answered').click();
  await expect(ownersEvent).toContainText(`Going: ${ann.name}`);

  expect(problems).toEqual([]);
  await Promise.all([owner.ctx.close(), ann.ctx.close()]);
});
