import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  axeViolations,
  confirmEmailVia,
  horizontalOverflow,
  newContext,
  pageReady,
  signUpVia,
  smallTargets,
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

/** A name nobody else's run can have, so the shared directory never confuses two tests. */
const hallName = (label: string) => `${label} ${Date.now().toString(36)}`;

/** The card (a Town Hall or an invite, both clay cards) whose h2 is this name. */
const hallCard = (page: Page, name: string) =>
  page
    .getByRole('heading', { name, level: 2, exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " clay ")][1]');

async function startViaUi(p: Person, name: string, visibility: 'open' | 'members' | 'invite') {
  await p.page.goto('/town-halls');
  await pageReady(p.page);
  await p.page.getByRole('button', { name: 'Start a Town Hall' }).click();
  await p.page.getByLabel('Name').fill(name);
  await p.page.getByLabel('What is it about?').fill(`All about ${name}.`);
  await p.page.getByLabel('Who can find and join it?').selectOption(visibility);
  await p.page.getByRole('button', { name: 'Start it' }).click();
  await p.page.getByRole('tab', { name: /^Mine/ }).click();
  const manage = hallCard(p.page, name).getByRole('link', { name: 'Manage' });
  await expect(manage).toBeVisible();
  const href = await manage.getAttribute('href');
  return href!.split('/').pop()!;
}

test.describe('Town Halls (production build, real CSP)', () => {
  test('start, discover and join, invite-only stays hidden until invited, remove a member, delete', async ({
    browser,
  }) => {
    const a = await person(browser, 'hallowner');
    const b = await person(browser, 'halljoiner');
    const c = await person(browser, 'hallguest');
    const problems = await watchProblems(a.page);

    // Alice starts an open Town Hall; it is hers to manage.
    const openName = hallName('Chai Club');
    const openId = await startViaUi(a, openName, 'open');

    // Bob finds it in the directory and joins with one tap; opening it shows both of them.
    await b.page.goto('/town-halls');
    await pageReady(b.page);
    await hallCard(b.page, openName).getByRole('button', { name: 'Join' }).click();
    await hallCard(b.page, openName).getByRole('link', { name: 'Open' }).click();
    await expect(b.page).toHaveURL(new RegExp(`/town-halls/${openId}$`));
    await pageReady(b.page);
    await expect(b.page.getByRole('heading', { name: 'Members' })).toBeVisible();
    await expect(b.page.getByText(`@${a.handle}`)).toBeVisible();
    await expect(b.page.getByText(`@${b.handle}`)).toBeVisible();
    await expect(b.page.getByRole('button', { name: 'Leave' })).toBeVisible();
    await expect(b.page.getByRole('heading', { name: 'Invite someone' })).toHaveCount(0); // owners only

    // Alice starts an invite-only one: Carol cannot find it or open it (a real 404, like a made-up one).
    const secretName = hallName('Quiet Room');
    const secretId = await startViaUi(a, secretName, 'invite');
    await c.page.goto('/town-halls');
    await pageReady(c.page);
    await expect(c.page.getByRole('heading', { name: secretName })).toHaveCount(0);
    expect((await c.page.goto(`/town-halls/${secretId}`))?.status()).toBe(404);

    // Alice invites Carol by call sign; Carol sees the invite, joins, and can open it.
    await a.page.goto(`/town-halls/${secretId}`);
    await pageReady(a.page);
    await a.page.getByLabel('Their call sign').fill(`@${c.handle}`);
    await a.page.getByRole('button', { name: 'Send invite' }).click();
    await expect(a.page.getByText(`Invited @${c.handle.toLowerCase()}.`)).toBeVisible();
    await c.page.goto('/town-halls');
    await pageReady(c.page);
    await c.page.getByRole('tab', { name: 'Invites (1)' }).click();
    await expect(c.page.getByText(`Invited by @${a.handle}`)).toBeVisible();
    await hallCard(c.page, secretName).getByRole('button', { name: 'Join' }).click();
    await expect(c.page.getByText('No invites waiting')).toBeVisible();
    expect((await c.page.goto(`/town-halls/${secretId}`))?.status()).toBe(200);
    await expect(c.page.getByText(`@${c.handle}`)).toBeVisible();

    // Alice removes Bob from the open one: he is back to a Join button and no member list.
    await a.page.goto(`/town-halls/${openId}`);
    await pageReady(a.page);
    await a.page.getByRole('button', { name: 'Remove' }).click();
    await a.page
      .getByRole('alertdialog', { name: `Remove @${b.handle}?` })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(a.page.getByText(`@${b.handle}`)).toHaveCount(0);
    await b.page.reload();
    await pageReady(b.page);
    await expect(b.page.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(b.page.getByRole('heading', { name: 'Members' })).toHaveCount(0);

    // Alice deletes the invite-only one: it is gone for Carol too.
    await a.page.goto(`/town-halls/${secretId}`);
    await pageReady(a.page);
    await a.page.getByRole('button', { name: 'Delete this Town Hall' }).click();
    await a.page
      .getByRole('alertdialog', { name: 'Delete this Town Hall?' })
      .getByRole('button', { name: 'Delete it' })
      .click();
    await expect(a.page).toHaveURL(/\/town-halls$/);
    expect((await c.page.goto(`/town-halls/${secretId}`))?.status()).toBe(404);

    expect(problems).toEqual([]);
    await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
  });

  async function seed(browser: Browser, opts: Parameters<typeof newContext>[1]) {
    const a = await person(browser, `ta${Date.now().toString(36).slice(-4)}`, opts);
    const b = await person(browser, `tb${Date.now().toString(36).slice(-4)}`, opts);
    const made = await api(a, '/api/town-halls', {
      name: hallName('Layout Hall'),
      description: 'For checking how Town Halls look.',
      visibility: 'open',
    });
    expect(made.status()).toBe(201);
    const id = ((await made.json()) as { townHall: { id: string } }).townHall.id;
    expect((await api(b, `/api/town-halls/${id}`, { action: 'join' })).ok()).toBe(true);
    return { a, b, id };
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations on the directory and a Town Hall (${scheme})`, async ({ browser }) => {
      const { a, b, id } = await seed(browser, {
        colorScheme: scheme,
        bypassCSP: true,
        reducedMotion: 'reduce',
      });
      for (const path of ['/town-halls', `/town-halls/${id}`]) {
        await a.page.goto(path);
        await pageReady(a.page);
        expect(await axeViolations(a.page), `${path} (${scheme})`).toEqual([]);
      }
      await Promise.all([a.ctx.close(), b.ctx.close()]);
    });
  }

  test('no horizontal scroll at 320px and every control is at least 44px on touch', async ({ browser }) => {
    const { a, b, id } = await seed(browser, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 700 },
    });
    for (const path of ['/town-halls', `/town-halls/${id}`]) {
      await a.page.goto(path);
      await pageReady(a.page);
      expect(await horizontalOverflow(a.page), `${path} overflow`).toBeLessThanOrEqual(0);
      expect(await smallTargets(a.page), `${path} small targets`).toEqual([]);
    }
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});
