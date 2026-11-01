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

/** A name nobody else's run can have, so two tests never confuse their groups. */
const hallName = (label: string) => `${label} ${Date.now().toString(36)}`;

async function makePals(asker: Person, asked: Person) {
  expect((await api(asker, `/api/relationships/${asked.handle}`, { action: 'request' })).ok()).toBe(true);
  expect((await api(asked, `/api/relationships/${asker.handle}`, { action: 'accept' })).ok()).toBe(true);
}

/** Start a group from the dialog on /groups; you land on its page. Returns its id. */
async function startViaUi(p: Person, name: string, visibility: 'open' | 'invite') {
  await p.page.goto('/groups');
  await pageReady(p.page);
  await p.page.getByRole('button', { name: 'Start a group' }).click();
  const dialog = p.page.getByRole('dialog', { name: 'Start a group' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('What is it about?').fill(`All about ${name}.`);
  await dialog.getByLabel('Who can find it?').selectOption(visibility);
  await dialog.getByRole('button', { name: 'Start it' }).click();
  await expect(p.page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/);
  await expect(p.page.getByRole('heading', { name, level: 1 })).toBeVisible();
  return p.page.url().split('/').pop()!;
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

test.describe('Groups as circles (production build, real CSP)', () => {
  test('start one, a friend finds and joins it, a link opens it, private stays hidden until invited, remove, delete', async ({
    browser,
  }) => {
    test.slow(); // three people sign up
    const a = await person(browser, 'hallowner');
    const b = await person(browser, 'halljoiner');
    const c = await person(browser, 'hallguest');
    await makePals(b, a);
    const problems = await watchProblems(a.page);

    // Alice starts one her friends can find; she lands on it, hers to manage.
    const openName = hallName('Chai Club');
    const openId = await startViaUi(a, openName, 'open');
    await expect(tab(a.page, 'Manage')).toBeVisible();

    // Bob, her friend, finds it under "Groups your friends are in" and joins with one tap.
    await b.page.goto('/groups');
    await pageReady(b.page);
    const found = b.page.getByRole('region', { name: 'Groups your friends are in' });
    await expect(found.getByText('1 friend is here')).toBeVisible();
    await found.getByRole('button', { name: `Join ${openName}` }).click();
    await found.getByRole('link', { name: 'Open' }).click();
    await expect(b.page).toHaveURL(new RegExp(`/groups/${openId}$`));
    await pageReady(b.page);
    await tab(b.page, 'Members').click();
    await expect(b.page.getByText(`@${a.handle}`)).toBeVisible();
    await expect(b.page.getByText(`@${b.handle}`)).toBeVisible();
    await expect(b.page.getByRole('button', { name: 'Leave' })).toBeVisible();
    await expect(tab(b.page, 'Manage')).toHaveCount(0); // the Owner and Deputies only

    // Carol is nobody's friend here: it is not listed for her, but its link opens it, with a Join button.
    await c.page.goto('/groups');
    await pageReady(c.page);
    await expect(c.page.getByText(openName)).toHaveCount(0);
    await c.page.goto(`/groups/${openId}`);
    await pageReady(c.page);
    await expect(c.page.getByRole('button', { name: 'Join' })).toBeVisible();

    // A private one: Carol cannot open it (a real 404, like a made-up one) until Alice invites her.
    const secretName = hallName('Family');
    const secretId = await startViaUi(a, secretName, 'invite');
    expect((await c.page.goto(`/groups/${secretId}`))?.status()).toBe(404);
    await tab(a.page, 'Manage').click();
    await a.page.getByLabel('Their username').fill(`@${c.handle}`);
    await a.page.getByRole('button', { name: 'Send invite' }).click();
    await expect(a.page.getByText(`Invited @${c.handle.toLowerCase()}.`)).toBeVisible();
    await c.page.goto('/groups');
    await pageReady(c.page);
    await expect(c.page.getByRole('heading', { name: 'Invites for you (1)' })).toBeVisible();
    await expect(c.page.getByText(`Invited by @${a.handle}`)).toBeVisible();
    await c.page.getByRole('button', { name: `Join ${secretName}` }).click();
    await expect(c.page.getByRole('heading', { name: /^Invites for you/ })).toHaveCount(0);
    await expect(c.page.getByRole('link', { name: new RegExp(secretName) })).toBeVisible(); // under Your groups
    expect((await c.page.goto(`/groups/${secretId}`))?.status()).toBe(200);

    // Alice removes Bob from the open one: he is back to a Join button and no tabs.
    await a.page.goto(`/groups/${openId}`);
    await pageReady(a.page);
    await tab(a.page, 'Members').click();
    // Member actions live in each row's Options menu (ADR-041).
    await a.page.getByRole('button', { name: `Options for @${b.handle}` }).click();
    await a.page.getByRole('menuitem', { name: 'Remove…' }).click();
    await a.page
      .getByRole('alertdialog', { name: `Remove @${b.handle}?` })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(a.page.getByText(`@${b.handle}`)).toHaveCount(0);
    await b.page.reload();
    await pageReady(b.page);
    await expect(b.page.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(tab(b.page, 'Members')).toHaveCount(0);

    // Alice deletes the private one from its Manage tab: it is gone for Carol too.
    await a.page.goto(`/groups/${secretId}`);
    await pageReady(a.page);
    await tab(a.page, 'Manage').click();
    await a.page.getByRole('button', { name: 'Delete this group' }).click();
    await a.page
      .getByRole('alertdialog', { name: 'Delete this group?' })
      .getByRole('button', { name: 'Delete it' })
      .click();
    await expect(a.page).toHaveURL(/\/groups$/);
    expect((await c.page.goto(`/groups/${secretId}`))?.status()).toBe(404);

    expect(problems).toEqual([]);
    await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
  });

  async function seed(browser: Browser, opts: Parameters<typeof newContext>[1]) {
    const a = await person(browser, `ta${Date.now().toString(36).slice(-4)}`, opts);
    const b = await person(browser, `tb${Date.now().toString(36).slice(-4)}`, opts);
    const made = await api(a, '/api/town-halls', {
      name: hallName('Layout Hall'),
      description: 'For checking how groups look.',
      visibility: 'open',
    });
    expect(made.status()).toBe(201);
    const id = ((await made.json()) as { townHall: { id: string } }).townHall.id;
    expect((await api(b, `/api/town-halls/${id}`, { action: 'join' })).ok()).toBe(true);
    return { a, b, id };
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations on Groups and a group (${scheme})`, async ({ browser }) => {
      const { a, b, id } = await seed(browser, {
        colorScheme: scheme,
        bypassCSP: true,
        reducedMotion: 'reduce',
      });
      for (const path of ['/groups', `/groups/${id}`]) {
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
    for (const path of ['/groups', `/groups/${id}`]) {
      await a.page.goto(path);
      await pageReady(a.page);
      expect(await horizontalOverflow(a.page), `${path} overflow`).toBeLessThanOrEqual(0);
      expect(await smallTargets(a.page), `${path} small targets`).toEqual([]);
    }
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});
