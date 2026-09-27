import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  axeViolations,
  confirmEmailVia,
  horizontalOverflow,
  newContext,
  pageReady,
  signUpVia,
  smallTargets,
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

/** Chime texts, newest first. Chimes ring after the response, so callers poll this. */
const chimeTexts = async (p: Person) =>
  ((await (await p.page.request.get('/api/me/chimes')).json()) as { chimes: { text: string }[] }).chimes.map(
    (c) => c.text,
  );

/** The Tributes on the Porch, in the order shown (each is a quote in a figure). */
const shownTributes = (page: Page) => page.locator('figure blockquote');
/** The list item holding the Tribute with this text, for its own buttons. */
const tributeItem = (page: Page, body: string) => page.getByRole('listitem').filter({ hasText: body });

async function leaveTribute(p: Person, ownerHandle: string, body: string) {
  await p.page.goto(`/porch/${ownerHandle}`);
  await pageReady(p.page);
  await p.page.getByLabel('Leave a Tribute').fill(body);
  await p.page.getByRole('button', { name: 'Leave Tribute' }).click();
  await expect(p.page.getByText('Tribute sent. It waits for approval.')).toBeVisible();
}

test.describe('Tributes (production build, real CSP)', () => {
  test('a Pal leaves one, it waits unseen, the owner approves it, pins one to the top and takes one down', async ({
    browser,
  }) => {
    const a = await person(browser, 'tribowner');
    const b = await person(browser, 'tribpal');
    const c = await person(browser, 'tribvisitor');
    const problemsA = await watchProblems(a.page);
    const problemsB = await watchProblems(b.page);
    await makePals(b, a);

    // Bob leaves a Tribute: he sees it at once, honestly marked as waiting, with a way to take it back.
    const first = `Always the first to help ${Date.now().toString(36)}`;
    await leaveTribute(b, a.handle, first);
    const mine = tributeItem(b.page, first);
    await expect(mine.getByText('Waiting for approval')).toBeVisible();
    await expect(mine.getByRole('button', { name: 'Take it back' })).toBeVisible();

    // Carol is not Alice's Pal: nothing to read yet, and no box to write in.
    await c.page.goto(`/porch/${a.handle}`);
    await pageReady(c.page);
    await expect(c.page.getByRole('heading', { name: 'Tributes', level: 2 })).toBeVisible();
    await expect(c.page.getByText(first)).toHaveCount(0);
    await expect(c.page.getByLabel('Leave a Tribute')).toHaveCount(0);

    // Alice is told it is waiting, and approves it from her own Porch.
    await expect
      .poll(() => chimeTexts(a), { timeout: 10_000 })
      .toContain(`A Tribute from ${b.handle} is waiting for your approval.`);
    await a.page.goto(`/porch/${a.handle}`);
    await pageReady(a.page);
    await expect(a.page.getByRole('heading', { name: 'Waiting for you (1)' })).toBeVisible();
    await expect(a.page.getByText(`Tribute from @${b.handle}`)).toBeVisible();
    await a.page.getByRole('button', { name: 'Approve' }).click();
    await expect(a.page.getByRole('heading', { name: /^Waiting for you/ })).toHaveCount(0);
    await expect(shownTributes(a.page).first()).toContainText(first);

    // Bob is told; Carol can read it now; nobody sees a "waiting" badge any more.
    await expect
      .poll(() => chimeTexts(b), { timeout: 10_000 })
      .toContain(`${a.handle} approved your Tribute. It is on their Porch now.`);
    await c.page.reload();
    await pageReady(c.page);
    await expect(shownTributes(c.page).first()).toContainText(first);
    await expect(c.page.getByText('Waiting for approval')).toHaveCount(0);

    // A second one, approved too: newest first — until Alice pins the older one, which moves to the top at once.
    const second = `Makes the best chai ${Date.now().toString(36)}`;
    await leaveTribute(b, a.handle, second);
    await a.page.reload();
    await pageReady(a.page);
    await a.page.getByRole('button', { name: 'Approve' }).click();
    await expect(shownTributes(a.page).first()).toContainText(second);
    await tributeItem(a.page, first).getByRole('button', { name: 'Pin to top' }).click();
    await expect(shownTributes(a.page).first()).toContainText(first);
    await expect(tributeItem(a.page, first).getByText('Pinned Tribute')).toBeVisible();
    await expect(tributeItem(a.page, first).getByRole('button', { name: 'Unpin' })).toBeVisible();
    await c.page.reload(); // the order is saved, not just on Alice's screen
    await pageReady(c.page);
    await expect(shownTributes(c.page).first()).toContainText(first);

    // Alice takes the second one down; it is gone for everyone.
    await tributeItem(a.page, second).getByRole('button', { name: 'Take it down' }).click();
    await a.page
      .getByRole('alertdialog', { name: 'Take this Tribute down?' })
      .getByRole('button', { name: 'Take it down' })
      .click();
    await expect(a.page.getByText('Tribute taken down.')).toBeVisible();
    await expect(shownTributes(a.page)).toHaveCount(1);
    await c.page.reload();
    await pageReady(c.page);
    await expect(c.page.getByText(second)).toHaveCount(0);

    expect([...problemsA, ...problemsB]).toEqual([]);
    await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
  });

  /** An owner with one approved Tribute and one still waiting, from the same Pal. */
  async function seed(browser: Browser, opts: Parameters<typeof newContext>[1]) {
    const a = await person(browser, `ra${Date.now().toString(36).slice(-4)}`, opts);
    const b = await person(browser, `rb${Date.now().toString(36).slice(-4)}`, opts);
    await makePals(b, a);
    const made = await api(b, `/api/porch/${a.handle}/tributes`, { body: 'Kind to everyone, always.' });
    expect(made.status()).toBe(201);
    const id = ((await made.json()) as { tribute: { id: string } }).tribute.id;
    expect((await api(a, `/api/tributes/${id}/approve`, {})).ok()).toBe(true);
    expect(
      (await api(b, `/api/porch/${a.handle}/tributes`, { body: 'Still waiting on this one.' })).status(),
    ).toBe(201);
    return { a, b };
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations on a Porch with Tributes, as owner and as author (${scheme})`, async ({
      browser,
    }) => {
      const { a, b } = await seed(browser, { colorScheme: scheme, bypassCSP: true, reducedMotion: 'reduce' });
      for (const [who, p] of [
        ['owner', a],
        ['author', b],
      ] as const) {
        await p.page.goto(`/porch/${a.handle}`);
        await pageReady(p.page);
        expect(await axeViolations(p.page), `${who} (${scheme})`).toEqual([]);
      }
      await Promise.all([a.ctx.close(), b.ctx.close()]);
    });
  }

  test('no horizontal scroll at 320px and every Tribute control is at least 44px on touch', async ({
    browser,
  }) => {
    const { a, b } = await seed(browser, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 700 },
    });
    for (const p of [a, b]) {
      await p.page.goto(`/porch/${a.handle}`);
      await pageReady(p.page);
      expect(await horizontalOverflow(p.page)).toBeLessThanOrEqual(0);
      expect(await smallTargets(p.page)).toEqual([]);
    }
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});
