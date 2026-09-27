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

const picks = (page: Page) => page.getByRole('group', { name: 'Award a Mark' });

test.describe('Marks and the Vibe Matrix (production build, real CSP)', () => {
  test('a Pal awards one Mark, sees it counted, then waits 30 days; the owner and a stranger cannot award', async ({
    browser,
  }) => {
    const a = await person(browser, 'markowner');
    const b = await person(browser, 'markpal');
    const c = await person(browser, 'markstranger');
    const problems = await watchProblems(b.page);
    await makePals(b, a);

    // Bob opens Alice's Porch: plain counts (nothing earned yet), each Mark's meaning, and five picks.
    await b.page.goto(`/porch/${a.handle}`);
    await pageReady(b.page);
    const box = b.page;
    await expect(box.getByText('Rare, genuinely valuable')).toBeVisible();
    await expect(box.getByText('0 Marks total. The percentages show up after 20 — 20 to go.')).toBeVisible();
    for (const kind of ['Gem', 'Pure', 'Chill', 'Sharp', 'Bold'])
      await expect(picks(b.page).getByRole('button', { name: kind })).toBeEnabled();

    // He gives a Sharp Mark: it is counted at once, and every pick is closed for 30 days.
    await picks(b.page).getByRole('button', { name: 'Sharp' }).click();
    await expect(b.page.getByText('You gave a Sharp Mark.')).toBeVisible();
    await expect(box.getByText('1 Mark total. The percentages show up after 20 — 19 to go.')).toBeVisible();
    await expect(box.getByText('You can Mark them again in 30 days.')).toBeVisible();
    for (const kind of ['Gem', 'Pure', 'Chill', 'Sharp', 'Bold'])
      await expect(picks(b.page).getByRole('button', { name: kind })).toBeDisabled();

    // It really was saved: a reload keeps the count and the wait.
    await b.page.reload();
    await pageReady(b.page);
    await expect(b.page.getByText(/^1 Mark total\./)).toBeVisible();
    await expect(picks(b.page).getByRole('button', { name: 'Gem' })).toBeDisabled();
    await expect(b.page.getByText('You can Mark them again in 30 days.')).toBeVisible();

    // Alice is told someone gave her a Mark, never which kind; her own Porch shows the count and no picks.
    await expect
      .poll(
        async () =>
          (
            (await (await a.page.request.get('/api/me/chimes')).json()) as { chimes: { text: string }[] }
          ).chimes.map((x) => x.text),
        { timeout: 10_000 },
      )
      .toContain(`${b.handle} gave you a Mark.`);
    await a.page.goto(`/porch/${a.handle}`);
    await pageReady(a.page);
    await expect(a.page.getByText(/^1 Mark total\./)).toBeVisible();
    await expect(picks(a.page)).toHaveCount(0);

    // Carol is not Alice's Pal: she sees the tally, but the picks are closed (and nothing says why).
    await c.page.goto(`/porch/${a.handle}`);
    await pageReady(c.page);
    await expect(c.page.getByText(/^1 Mark total\./)).toBeVisible();
    await expect(picks(c.page).getByRole('button', { name: 'Gem' })).toBeDisabled();
    await expect(c.page.getByText(/Mark them again/)).toHaveCount(0);
    expect((await api(c, `/api/porch/${a.handle}/marks`, { kind: 'gem' })).status()).toBe(403);

    expect(problems).toEqual([]);
    await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
  });

  async function seed(browser: Browser, opts: Parameters<typeof newContext>[1]) {
    const a = await person(browser, `ma${Date.now().toString(36).slice(-4)}`, opts);
    const b = await person(browser, `mb${Date.now().toString(36).slice(-4)}`, opts);
    await makePals(b, a);
    expect((await api(b, `/api/porch/${a.handle}/marks`, { kind: 'chill' })).status()).toBe(201);
    return { a, b };
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations on a Porch with Marks (${scheme})`, async ({ browser }) => {
      const { a, b } = await seed(browser, { colorScheme: scheme, bypassCSP: true, reducedMotion: 'reduce' });
      for (const p of [a, b]) {
        await p.page.goto(`/porch/${a.handle}`);
        await pageReady(p.page);
        expect(await axeViolations(p.page), `${p === a ? 'owner' : 'pal'} (${scheme})`).toEqual([]);
      }
      await Promise.all([a.ctx.close(), b.ctx.close()]);
    });
  }

  test('no horizontal scroll at 320px and every Mark control is at least 44px on touch', async ({
    browser,
  }) => {
    const { a, b } = await seed(browser, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 700 },
    });
    await b.page.goto(`/porch/${a.handle}`);
    await pageReady(b.page);
    expect(await horizontalOverflow(b.page)).toBeLessThanOrEqual(0);
    expect(await smallTargets(b.page)).toEqual([]);
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});
