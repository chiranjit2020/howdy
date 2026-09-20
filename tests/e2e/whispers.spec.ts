import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  axeSource,
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

const api = (p: Person, path: string, data: unknown, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') =>
  p.page.request.fetch(path, { method, data, headers: { origin: ORIGIN } });

async function makePosse(asker: Person, asked: Person) {
  expect((await api(asker, `/api/relationships/${asked.handle}`, { action: 'request' })).ok()).toBe(true);
  expect((await api(asked, `/api/relationships/${asker.handle}`, { action: 'accept' })).ok()).toBe(true);
}

const log = (page: Page) => page.getByRole('log');
const status = (page: Page) =>
  page
    .getByRole('status')
    .filter({ hasText: /Live|Connecting|Reconnecting|Signed out|within a few seconds/ });

async function say(page: Page, text: string) {
  await page.getByLabel(/^Whisper to /).fill(text);
  await page.getByLabel(/^Whisper to /).press('Enter');
}

test.describe('Whispers in a real browser (production build, real CSP, real WebSocket process)', () => {
  test('start from a Ranch, talk live in both directions, read state stays private, Burn Thread', async ({
    browser,
  }) => {
    const a = await person(browser, 'wa');
    const b = await person(browser, 'wb');
    await makePosse(b, a);
    const problems = await watchProblems(a.page);

    // Alice opens Bob's Ranch and starts a Whisper from the button there.
    await a.page.goto(`/ranch/${b.handle}`);
    await a.page.getByRole('link', { name: 'Whisper', exact: true }).click();
    await expect(a.page).toHaveURL(new RegExp(`/whispers/${b.handle}$`));
    await expect(status(a.page)).toHaveText('Live'); // the CSP allowed exactly this socket, and the session cookie authenticated it

    await b.page.goto(`/whispers/${a.handle}`);
    await expect(status(b.page)).toHaveText('Live');

    // A message reaches the other person without any reload.
    await say(a.page, 'Howdy Bob, live from the ranch');
    await expect(log(a.page).getByText('Howdy Bob, live from the ranch')).toBeVisible();
    await expect(log(a.page).getByText('Sent', { exact: true })).toBeVisible();
    await expect(log(b.page).getByText('Howdy Bob, live from the ranch')).toBeVisible();
    await say(b.page, 'Howdy Alice!');
    await expect(log(a.page).getByText('Howdy Alice!')).toBeVisible();
    await expect(a.page.getByLabel(/^Whisper to /)).toHaveValue('');

    // Nothing shows Bob whether Alice has read it (no read receipts anywhere in the thread).
    await expect(log(b.page).getByText(/(seen|read|delivered)/i)).toHaveCount(0);

    // A reload keeps it all (it was stored), in order.
    await a.page.reload();
    const texts = await log(a.page).getByRole('paragraph').allInnerTexts();
    expect(texts.join(' ')).toMatch(/Howdy Bob, live from the ranch[\s\S]*Howdy Alice!/);

    // While Bob is elsewhere, a new Whisper shows up as an unread thread and a header badge.
    await b.page.goto('/home');
    await say(a.page, 'Are you around?');
    await expect(log(a.page).getByText('Are you around?')).toBeVisible();
    await expect(async () => {
      await b.page.goto('/whispers');
      await expect(b.page.getByRole('link', { name: /^Whispers\s*,\s*1 unread$/ })).toBeVisible();
    }).toPass({ timeout: 10_000 });
    await expect(b.page.getByRole('link', { name: new RegExp(a.handle) })).toContainText('Are you around?');
    await b.page.getByRole('link', { name: new RegExp(a.handle) }).click();
    await expect(log(b.page).getByText('Are you around?')).toBeVisible();
    await expect
      .poll(
        async () =>
          ((await (await b.page.request.get('/api/whispers/unread')).json()) as { unread: number }).unread,
      )
      .toBe(0);

    // Burn Thread: confirmation first, then it is gone for both.
    await a.page.getByRole('button', { name: 'Burn thread' }).click();
    await expect(a.page.getByRole('alertdialog')).toBeVisible();
    await a.page.getByRole('button', { name: 'Cancel' }).click();
    await expect(log(a.page).getByText('Are you around?')).toBeVisible();
    await a.page.getByRole('button', { name: 'Burn thread' }).click();
    await a.page.getByRole('button', { name: 'Burn it' }).click();
    await expect(a.page).toHaveURL(/\/whispers$/);
    await expect(a.page.getByText('No Whispers yet')).toBeVisible();
    await b.page.reload();
    await expect(log(b.page).getByText('Howdy Bob, live from the ranch')).toHaveCount(0);

    expect(problems).toEqual([]);
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });

  test('without the live connection everything still works: sending falls back to HTTP, and the page catches up by itself', async ({
    browser,
  }) => {
    const a = await person(browser, 'wc');
    const b = await person(browser, 'wd');
    await makePosse(b, a);
    // Alice's socket can never connect (a network that blocks WebSockets, or a dead server).
    await a.page.routeWebSocket(/localhost:3301/, (ws) => void ws.close());
    await a.page.goto(`/whispers/${b.handle}`);
    await expect(status(a.page)).toContainText('Reconnecting');

    await b.page.goto(`/whispers/${a.handle}`);
    await expect(status(b.page)).toHaveText('Live');

    await say(a.page, 'sent over plain HTTP');
    await expect(log(a.page).getByText('Sent', { exact: true })).toBeVisible();
    await expect(log(b.page).getByText('sent over plain HTTP')).toBeVisible();

    // Bob's reply reaches Alice with no socket: her page asks for what it missed.
    await say(b.page, 'reply while your socket is down');
    await expect(log(a.page).getByText('reply while your socket is down')).toBeVisible({ timeout: 20_000 });
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });

  test('a person who is no longer allowed is told nothing useful: block → not found, held words look sent', async ({
    browser,
  }) => {
    const a = await person(browser, 'we');
    const b = await person(browser, 'wf');
    const c = await person(browser, 'wg');
    await makePosse(b, a);
    await makePosse(c, a);

    // Restrict: Carol's words look sent to Carol, and Alice sees nothing at all.
    expect((await api(a, `/api/relationships/${c.handle}`, { action: 'restrict' })).ok()).toBe(true);
    await c.page.goto(`/whispers/${a.handle}`);
    await a.page.goto(`/whispers/${c.handle}`);
    await say(c.page, 'held words from Carol');
    await expect(log(c.page).getByText('held words from Carol')).toBeVisible();
    await expect(log(c.page).getByText('Sent', { exact: true })).toBeVisible();
    await a.page.waitForTimeout(1200);
    await expect(log(a.page).getByText('held words from Carol')).toHaveCount(0);
    await a.page.goto('/whispers');
    await expect(a.page.getByText('No Whispers yet')).toBeVisible();

    // Block: Bob is in a live thread when Alice blocks him. His next send fails; the thread is now a plain 404.
    await b.page.goto(`/whispers/${a.handle}`);
    await expect(status(b.page)).toHaveText('Live');
    expect((await api(a, `/api/relationships/${b.handle}`, { action: 'block' })).ok()).toBe(true);
    await say(b.page, 'are you there?');
    await expect(b.page.getByText('Not sent')).toBeVisible();
    await expect(b.page.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect((await b.page.goto(`/whispers/${a.handle}`))?.status()).toBe(404);
    await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
  });

  test('signing out ends the live connection', async ({ browser }) => {
    const a = await person(browser, 'wh');
    const b = await person(browser, 'wi');
    await makePosse(b, a);
    await a.page.goto(`/whispers/${b.handle}`);
    await expect(status(a.page)).toHaveText('Live');
    expect((await api(a, '/api/auth/logout', {})).ok()).toBe(true);
    await expect(status(a.page)).toContainText('Signed out', { timeout: 15_000 });
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});

test.describe('Whispers: accessibility and layout in a real browser', () => {
  async function seed(browser: Browser, opts: Parameters<typeof newContext>[1]) {
    const a = await person(browser, `xa${Date.now().toString(36).slice(-4)}`, opts);
    const b = await person(browser, `xb${Date.now().toString(36).slice(-4)}`, opts);
    await makePosse(b, a);
    await api(b, `/api/whispers/${a.handle}`, {
      clientId: crypto.randomUUID(),
      body: 'Hello from the other side',
    });
    await api(a, `/api/whispers/${b.handle}`, { clientId: crypto.randomUUID(), body: 'x'.repeat(200) }); // unbroken
    await api(b, `/api/whispers/${a.handle}`, {
      clientId: crypto.randomUUID(),
      body: 'A last unread line for the list',
    });
    return { a, b };
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations, including real colour contrast (${scheme})`, async ({ browser }) => {
      const { a, b } = await seed(browser, { colorScheme: scheme, bypassCSP: true, reducedMotion: 'reduce' });
      const source = axeSource();
      for (const path of ['/whispers', `/whispers/${b.handle}`, '/workshop', `/ranch/${b.handle}`]) {
        await a.page.goto(path);
        await a.page.evaluate(() => document.fonts.ready);
        await a.page.addScriptTag({ content: source });
        const violations = await a.page.evaluate(async () => {
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
              `${v.id}: ${v.help} (${v.nodes.map((n) => `${n.target.join(' ')} — ${n.any.map((x) => x.message).join('; ')}`).join(', ')})`,
          );
        });
        expect(violations, `${path} (${scheme})`).toEqual([]);
      }
      await Promise.all([a.ctx.close(), b.ctx.close()]);
    });
  }

  test('no horizontal scroll at 320px, every control is at least 44px, and a long unbroken Whisper stays in its bubble', async ({
    browser,
  }) => {
    const { a, b } = await seed(browser, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 700 },
    });
    for (const path of ['/whispers', `/whispers/${b.handle}`]) {
      await a.page.goto(path);
      expect(
        await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        `${path} overflow`,
      ).toBeLessThanOrEqual(0);
      const problems = await a.page.evaluate(() => {
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
        for (const p of document.querySelectorAll<HTMLElement>('[role="log"] p, main li p, main li span')) {
          if (
            p.scrollWidth > p.clientWidth + 1 &&
            !p.classList.contains('truncate') &&
            !p.closest('.sr-only')
          )
            out.push(`text overflows: ${(p.textContent ?? '').slice(0, 30)}`);
        }
        return out;
      });
      expect(problems, `${path} layout`).toEqual([]);
    }
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});
