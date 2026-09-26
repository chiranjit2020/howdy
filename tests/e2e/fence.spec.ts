import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import {
  axeSource,
  horizontalOverflow,
  confirmEmailVia,
  newContext,
  signUpVia,
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

const api = (p: Person, path: string, data: unknown, method: 'POST' | 'PATCH' = 'POST') =>
  p.page.request.fetch(path, { method, data, headers: { origin: ORIGIN } });

/** `asker` asks `asked` into their Posse and `asked` accepts, through the API (the UI path is covered elsewhere). */
async function makePosse(asker: Person, asked: Person) {
  expect((await api(asker, `/api/relationships/${asked.handle}`, { action: 'request' })).ok()).toBe(true);
  expect((await api(asked, `/api/relationships/${asker.handle}`, { action: 'accept' })).ok()).toBe(true);
}

const cardWith = (page: Page, text: string): Locator => page.getByRole('article').filter({ hasText: text });

async function nailVia(page: Page, text: string) {
  await page.getByLabel('Nail a Post Card').fill(text);
  await page.getByRole('button', { name: 'Nail to Fence' }).click();
  await expect(cardWith(page, text)).toBeVisible();
}

test.describe('The Fence in a real browser (production build, real CSP)', () => {
  test('nail, Yo, scribble, hold for approval, Scrape clean, Flag trouble and Block — as several people', async ({
    browser,
  }) => {
    const a = await person(browser, 'owner');
    const b = await person(browser, 'friend');
    const c = await person(browser, 'stranger');
    await makePosse(b, a);
    const problems = await watchProblems(b.page);

    // The owner nails the first card.
    await a.page.goto(`/porch/${a.handle}`);
    await expect(a.page.getByRole('heading', { name: 'The Fence' })).toBeVisible();
    await expect(a.page.getByText('Nothing nailed up yet')).toBeVisible();
    await nailVia(a.page, 'Howdy from the ranch');
    await expect(a.page.getByLabel('Nail a Post Card')).toHaveValue(''); // cleared after posting

    // A Posse friend sees it, writes on the Fence, gives a Yo and scribbles a reply.
    await b.page.goto(`/porch/${a.handle}`);
    await expect(cardWith(b.page, 'Howdy from the ranch')).toBeVisible();
    await nailVia(b.page, 'Hi from Bob');
    const owners = cardWith(b.page, 'Howdy from the ranch');
    const yo = owners.getByRole('button', { name: /^Yo/ });
    await expect(yo).toHaveAttribute('aria-pressed', 'false');
    await yo.click();
    await expect(yo).toHaveAttribute('aria-pressed', 'true');
    await expect(yo).toContainText('1');
    await owners.getByRole('button', { name: /^Flip/ }).click();
    await b.page.getByLabel('Scribble a reply').fill('Nice ranch!');
    await b.page.getByRole('button', { name: 'Scribble' }).click();
    await expect(b.page.getByText('Nice ranch!')).toBeVisible();

    // A refresh keeps everything (it really was saved), and the owner sees the Yo count.
    await a.page.reload();
    await expect(cardWith(a.page, 'Hi from Bob')).toBeVisible();
    await expect(cardWith(a.page, 'Howdy from the ranch').getByText('1 Yo')).toBeVisible(); // own card: count, no button
    await expect(cardWith(a.page, 'Howdy from the ranch').getByRole('button', { name: /^Yo/ })).toHaveCount(
      0,
    );

    // A stranger reads the wall (members can) but the composer is not offered: only the Posse may write.
    await c.page.goto(`/porch/${a.handle}`);
    await expect(cardWith(c.page, 'Hi from Bob')).toBeVisible();
    await expect(c.page.getByLabel('Nail a Post Card')).toHaveCount(0);
    expect((await api(c, `/api/porch/${a.handle}/fence`, { body: 'let me in' })).status()).toBe(403);

    // Restrict: Bob's next card looks posted to Bob, is invisible to others, and waits for Alice.
    expect((await api(a, `/api/relationships/${b.handle}`, { action: 'restrict' })).ok()).toBe(true);
    await nailVia(b.page, 'Quiet words from Bob');
    // Bob is never told. (The Tributes notice says "wait for … to approve" to every visitor, restricted or not.)
    await expect(
      b.page.getByText(/waiting|approve/i).filter({ hasNotText: /^Tributes always wait for/ }),
    ).toHaveCount(0);
    await c.page.reload();
    await expect(cardWith(c.page, 'Quiet words from Bob')).toHaveCount(0);
    await a.page.reload();
    await expect(cardWith(a.page, 'Quiet words from Bob')).toHaveCount(0);
    await expect(a.page.getByRole('heading', { name: 'Waiting for you (1)' })).toBeVisible();
    await a.page.getByRole('button', { name: 'Approve' }).click();
    await expect(cardWith(a.page, 'Quiet words from Bob')).toBeVisible();
    await expect(a.page.getByRole('heading', { name: /Waiting for you/ })).toHaveCount(0);
    await c.page.reload();
    await expect(cardWith(c.page, 'Quiet words from Bob')).toBeVisible();

    // Flag trouble on a card, from the card's menu.
    await c.page
      .getByRole('button', { name: 'More about this card from @' + b.handle })
      .first()
      .click();
    await c.page.getByRole('menuitem', { name: 'Flag trouble…' }).click();
    await c.page.getByRole('button', { name: 'Send report' }).click();
    await expect(
      c.page.getByRole('status').filter({ hasText: 'Thanks. We will take a look.' }),
    ).toBeVisible();

    // Scrape clean (owner) — with a confirmation, Cancel first.
    await a.page
      .getByRole('button', { name: 'More about this card from @' + b.handle })
      .first()
      .click();
    await a.page.getByRole('menuitem', { name: 'Scrape clean' }).click();
    await expect(a.page.getByRole('alertdialog')).toBeVisible();
    await a.page.getByRole('button', { name: 'Cancel' }).click();
    await expect(cardWith(a.page, 'Quiet words from Bob')).toBeVisible();
    await a.page
      .getByRole('button', { name: 'More about this card from @' + b.handle })
      .first()
      .click();
    await a.page.getByRole('menuitem', { name: 'Scrape clean' }).click();
    await a.page.getByRole('button', { name: 'Take it down' }).click();
    await expect(cardWith(a.page, 'Quiet words from Bob')).toHaveCount(0);

    // A writer can take their own card back.
    await b.page.reload();
    await b.page
      .getByRole('button', { name: 'More about this card from @' + b.handle })
      .first()
      .click();
    await b.page.getByRole('menuitem', { name: 'Take it back' }).click();
    await b.page.getByRole('button', { name: 'Take it down' }).click();
    await expect(cardWith(b.page, 'Hi from Bob')).toHaveCount(0);

    // Block: the whole Fence vanishes for the blocked person, exactly like a missing Ranch.
    expect((await api(a, `/api/relationships/${c.handle}`, { action: 'block' })).ok()).toBe(true);
    expect((await c.page.goto(`/porch/${a.handle}`))?.status()).toBe(404);

    expect(problems).toEqual([]);
    await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
  });

  test('Review mode: the writer is told, the owner approves; the Fence rules live in the Workshop', async ({
    browser,
  }) => {
    const a = await person(browser, 'reviewowner');
    const b = await person(browser, 'reviewfriend');
    await makePosse(b, a);
    await a.page.goto('/workshop');
    await a.page.getByLabel('Who can nail cards to it?').selectOption('members');
    await a.page.getByRole('switch', { name: /Approve cards first/ }).click();
    await a.page.getByRole('button', { name: 'Save Fence rules' }).click();
    await expect(a.page.getByRole('status').filter({ hasText: 'Fence rules updated' })).toBeVisible();

    await b.page.goto(`/porch/${a.handle}`);
    await expect(b.page.getByText(/Cards on this Fence wait for .* to approve/)).toBeVisible();
    await nailVia(b.page, 'Please approve me');
    await expect(cardWith(b.page, 'Please approve me').getByText(/Waiting for .* to approve/)).toBeVisible();

    await a.page.goto(`/porch/${a.handle}`);
    await expect(cardWith(a.page, 'Please approve me')).toHaveCount(0); // in the queue, not on the wall
    await expect(a.page.getByText('Please approve me')).toBeVisible();
    await expect(a.page.getByRole('heading', { name: 'Waiting for you (1)' })).toBeVisible();
    await a.page.getByRole('button', { name: 'Approve' }).click();
    await expect(a.page.getByRole('heading', { name: /Waiting for you/ })).toHaveCount(0);
    await expect(cardWith(a.page, 'Please approve me')).toBeVisible();
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});

test.describe('Fence: accessibility and layout in a real browser', () => {
  async function seed(browser: Browser, opts: Parameters<typeof newContext>[1]) {
    const a = await person(browser, `fa${Date.now().toString(36).slice(-4)}`, opts);
    const b = await person(browser, `fb${Date.now().toString(36).slice(-4)}`, opts);
    await makePosse(b, a);
    await api(a, '/api/me/porch', { fenceReview: false }, 'PATCH');
    const long = 'x'.repeat(150); // an unbreakable string: the classic way to break a layout
    const posted = await api(b, `/api/porch/${a.handle}/fence`, { body: long });
    expect(posted.status()).toBe(201);
    const first = await api(a, `/api/porch/${a.handle}/fence`, { body: 'A normal card with words in it' });
    const cardId = ((await first.json()) as { card: { id: string } }).card.id;
    await api(b, `/api/cards/${cardId}/yo`, { on: true });
    await api(b, `/api/cards/${cardId}/replies`, { body: 'A short reply' });
    await api(a, `/api/relationships/${b.handle}`, { action: 'restrict' });
    await api(b, `/api/porch/${a.handle}/fence`, { body: 'Held for approval' });
    return { a, b };
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations, including real colour contrast (${scheme})`, async ({ browser }) => {
      // Reduced motion: axe must not measure a card halfway through its flip-in fade.
      const { a, b } = await seed(browser, { colorScheme: scheme, bypassCSP: true, reducedMotion: 'reduce' });
      const source = axeSource();
      for (const [who, path] of [
        [a, `/porch/${a.handle}`], // owner: queue + menus
        [b, `/porch/${a.handle}`], // Posse friend: composer
        [a, '/workshop'], // Fence rules
      ] as const) {
        await who.page.goto(path);
        await who.page.evaluate(() => document.fonts.ready);
        if (path.startsWith('/ranch')) {
          // Also check the back of a card (replies + composer).
          await who.page.getByRole('button', { name: /^Flip/ }).first().click();
        }
        await who.page.addScriptTag({ content: source });
        const violations = await who.page.evaluate(async () => {
          const axe = (
            window as unknown as {
              axe: {
                run: () => Promise<{
                  violations: {
                    id: string;
                    help: string;
                    nodes: { target: string[]; any: { message: string }[] }[];
                  }[];
                }>;
              };
            }
          ).axe;
          return (await axe.run()).violations.map(
            (v) =>
              `${v.id}: ${v.help} (${v.nodes.map((n) => `${n.target.join(' ')} — ${n.any.map((a) => a.message).join('; ')}`).join(', ')})`,
          );
        });
        expect(violations, `${path} (${scheme})`).toEqual([]);
      }
      await Promise.all([a.ctx.close(), b.ctx.close()]);
    });
  }

  test('no horizontal scroll at 320px, every control is at least 44px, and long unbroken text stays inside its card', async ({
    browser,
  }) => {
    const opts = { hasTouch: true, isMobile: true, viewport: { width: 320, height: 700 } };
    const { a, b } = await seed(browser, opts);
    for (const [who, path] of [
      [a, `/porch/${a.handle}`],
      [b, `/porch/${a.handle}`],
      [a, '/workshop'],
    ] as const) {
      await who.page.goto(path);
      expect(await horizontalOverflow(who.page), `${path} overflow`).toBeLessThanOrEqual(0);
      const problems = await who.page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(
          'button, a[href], select, textarea, input:not([type="radio"])',
        )) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || el.closest('.sr-only')) continue;
          const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
          if (!inline && r.height < 43.5)
            out.push(
              `${el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 28)}" ${Math.round(r.height)}px`,
            );
        }
        // Text must not spill out of a card (a box's rect ignores overflowing text, so compare scroll and client widths).
        for (const card of document.querySelectorAll<HTMLElement>('article > div')) {
          if (card.scrollWidth > card.clientWidth + 1)
            out.push(`card overflows: ${(card.textContent ?? '').slice(0, 30)}`);
          for (const p of card.querySelectorAll<HTMLElement>('p:not(.truncate)')) {
            if (p.scrollWidth > p.clientWidth + 1)
              out.push(`text overflows: ${(p.textContent ?? '').slice(0, 30)}`);
          }
        }
        return out;
      });
      expect(problems, `${path} layout`).toEqual([]);
    }
    // The back of a card too.
    await b.page.goto(`/porch/${a.handle}`);
    await b.page.getByRole('button', { name: /^Flip/ }).first().click();
    expect(await horizontalOverflow(b.page), 'flipped overflow').toBeLessThanOrEqual(0);
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});
