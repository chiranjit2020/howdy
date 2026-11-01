import { expect, test, type Browser } from '@playwright/test';
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

/**
 * ADR-052: friends describe someone with one word (changeable, take-back-able) from the "You and …" card; the profile
 * shows the top words — "Friends say: Chill · Sharp" — once three people have picked, never a number.
 */

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

test.describe('Describing friends (production build, real CSP)', () => {
  test('a friend picks, changes and takes back a word; three picks show as words a stranger sees', async ({
    browser,
  }) => {
    test.slow(); // five people sign up
    const a = await person(browser, 'described');
    const b = await person(browser, 'describer');
    const c = await person(browser, 'describec');
    const d = await person(browser, 'described2');
    const e = await person(browser, 'dstranger');
    for (const p of [b, c, d]) await makePals(p, a);
    const problems = await watchProblems(b.page);

    // Bob opens Alice's profile: "Describe …" sits in the "You and …" card. He picks Chill.
    await b.page.goto(`/profile/${a.handle}`);
    await pageReady(b.page);
    const picker = b.page.getByRole('group', { name: new RegExp(`^Describe `) });
    const word = (name: string) => picker.getByRole('button', { name: new RegExp(`^${name} `) });
    await word('Chill').click();
    await expect(word('Chill')).toHaveAttribute('aria-pressed', 'true');
    await b.page.reload(); // saved, not just on his screen
    await pageReady(b.page);
    await expect(word('Chill')).toHaveAttribute('aria-pressed', 'true');

    // He changes his mind (one word, replaced), then taps it again to take it back, then picks Chill once more.
    await word('Sharp').click();
    await expect(word('Sharp')).toHaveAttribute('aria-pressed', 'true');
    await expect(word('Chill')).toHaveAttribute('aria-pressed', 'false');
    await word('Sharp').click();
    await expect(word('Sharp')).toHaveAttribute('aria-pressed', 'false');
    await word('Chill').click();
    await expect(word('Chill')).toHaveAttribute('aria-pressed', 'true');

    // With only one person, the profile says nothing yet.
    await e.page.goto(`/profile/${a.handle}`);
    await pageReady(e.page);
    await expect(e.page.getByText(/Friends say/)).toHaveCount(0);

    // Two more friends pick: now the top words show, and never a number.
    expect((await api(c, `/api/porch/${a.handle}/marks`, { kind: 'chill' })).status()).toBe(201);
    expect((await api(d, `/api/porch/${a.handle}/marks`, { kind: 'sharp' })).status()).toBe(201);
    await e.page.reload();
    await pageReady(e.page);
    await expect(e.page.getByText(/Friends say/)).toHaveText('Friends say: Chill · Sharp');
    // A stranger cannot describe her; nor can she describe herself.
    await expect(e.page.getByRole('group', { name: /^Describe / })).toHaveCount(0);
    await a.page.goto(`/profile/${a.handle}`);
    await pageReady(a.page);
    await expect(a.page.getByText(/Friends say/)).toHaveText('Friends say: Chill · Sharp');
    await expect(a.page.getByRole('group', { name: /^Describe / })).toHaveCount(0);

    // Alice was told someone described her, never which word.
    await expect
      .poll(
        async () =>
          (
            (await (await a.page.request.get('/api/me/chimes')).json()) as { chimes: { text: string }[] }
          ).chimes.some((x) => x.text.endsWith(' described you on Howdy.')),
        { timeout: 10_000 },
      )
      .toBe(true);

    expect(problems).toEqual([]);
    await Promise.all([a, b, c, d, e].map((p) => p.ctx.close()));
  });

  async function seed(browser: Browser, opts: Parameters<typeof newContext>[1]) {
    const a = await person(browser, `ma${Date.now().toString(36).slice(-4)}`, opts);
    const b = await person(browser, `mb${Date.now().toString(36).slice(-4)}`, opts);
    await makePals(b, a);
    expect((await api(b, `/api/porch/${a.handle}/marks`, { kind: 'chill' })).status()).toBe(201);
    return { a, b };
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations with the describe picker (${scheme})`, async ({ browser }) => {
      const { a, b } = await seed(browser, { colorScheme: scheme, bypassCSP: true, reducedMotion: 'reduce' });
      for (const p of [a, b]) {
        await p.page.goto(`/profile/${a.handle}`);
        await pageReady(p.page);
        expect(await axeViolations(p.page), `${p === a ? 'owner' : 'friend'} (${scheme})`).toEqual([]);
      }
      await Promise.all([a.ctx.close(), b.ctx.close()]);
    });
  }

  test('no horizontal scroll at 320px and every describe control is at least 44px on touch', async ({
    browser,
  }) => {
    const { a, b } = await seed(browser, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 700 },
    });
    await b.page.goto(`/profile/${a.handle}`);
    await pageReady(b.page);
    expect(await horizontalOverflow(b.page)).toBeLessThanOrEqual(0);
    expect(await smallTargets(b.page)).toEqual([]);
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});
