import { expect, test, type Browser, type Page } from '@playwright/test';
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

/** A signed-in person in their own browser context (own cookies, own client address). */
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

const signalOn = (page: Page, text: string) => page.locator('p', { hasText: text }).first();

async function saveBoundaries(page: Page, ranch: string, signal: string) {
  await page.goto('/workshop');
  await page.getByLabel('Who can open your Ranch?').selectOption(ranch);
  await page.getByLabel('Who can read your Signal?').selectOption(signal);
  await page.getByRole('button', { name: 'Save Boundary Lines' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Boundary Lines updated' })).toBeVisible();
}

test.describe('Ranch, Signal and Workshop (production build, real CSP)', () => {
  test('tend your own Ranch: Signal, display name and portrait', async ({ browser }) => {
    const a = await person(browser, 'tender');
    const problems = await watchProblems(a.page);

    await a.page.getByRole('link', { name: 'Visit your Ranch' }).click();
    await expect(a.page).toHaveURL(new RegExp(`/ranch/${a.handle}$`));
    await expect(a.page.getByRole('heading', { level: 1, name: a.handle })).toBeVisible(); // display name defaults to the handle

    // Signal: set, see it, clear it.
    await a.page.getByLabel('What is the vibe right now?').fill('In the zone. Send chai.');
    await a.page.getByRole('button', { name: 'Set Signal' }).click();
    await expect(signalOn(a.page, 'In the zone. Send chai.').filter({ hasText: /h left/ })).toBeVisible();
    await a.page.getByRole('button', { name: 'Clear' }).click();
    await expect(signalOn(a.page, 'In the zone. Send chai.').filter({ hasText: /h left/ })).toHaveCount(0);

    // A link in a Signal is refused, on the field, with a reason.
    await a.page.getByLabel('What is the vibe right now?').fill('follow me http://spam.example');
    await a.page.getByRole('button', { name: 'Set Signal' }).click();
    await expect(a.page.getByText(/Links are not allowed/)).toBeVisible();

    // Workshop: display name + portrait colour.
    await a.page.getByRole('link', { name: 'Workshop', exact: true }).first().click();
    await expect(a.page).toHaveURL(/\/workshop$/);
    await a.page.getByLabel('Display name').fill('  Priya   Sharma ');
    await a.page.getByLabel('Mint').check();
    await a.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(a.page.getByRole('status').filter({ hasText: 'Ranch tidied up' })).toBeVisible();

    await a.page.goto(`/ranch/${a.handle}`);
    await expect(a.page.getByRole('heading', { level: 1, name: 'Priya Sharma' })).toBeVisible(); // normalised
    await expect(a.page.getByText(`@${a.handle}`)).toBeVisible(); // the call sign never changes

    // A link in the display name is refused too.
    await a.page.goto('/workshop');
    await a.page.getByLabel('Display name').fill('Visit win-prizes.com');
    await a.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(a.page.getByText(/Links are not allowed/)).toBeVisible();

    expect(problems).toEqual([]);
    await a.ctx.close();
  });

  test('privacy between people: members-only by default, then widened and narrowed', async ({ browser }) => {
    const a = await person(browser, 'owner');
    const b = await person(browser, 'visitor');
    const anon = await newContext(browser);
    const anonPage = await anon.newPage();

    await a.page.goto(`/ranch/${a.handle}`);
    await a.page.getByLabel('What is the vibe right now?').fill('Members-only vibe');
    await a.page.getByRole('button', { name: 'Set Signal' }).click();
    await expect(signalOn(a.page, 'Members-only vibe').filter({ hasText: /h left/ })).toBeVisible();

    // Default: a signed-in member sees the Ranch and the Signal.
    await b.page.goto(`/ranch/${a.handle}`);
    await expect(b.page.getByRole('heading', { level: 1, name: a.handle })).toBeVisible();
    await expect(signalOn(b.page, 'Members-only vibe')).toBeVisible();
    await expect(b.page.getByLabel('What is the vibe right now?')).toHaveCount(0); // no owner controls for visitors
    await expect(b.page.getByRole('link', { name: 'Tend the Ranch' })).toHaveCount(0);

    // A signed-out visitor gets the SAME screen for a hidden Ranch and one that does not exist.
    const hidden = await anonPage.goto(`/ranch/${a.handle}`);
    const hiddenText = await anonPage.getByRole('main').innerText();
    const missing = await anonPage.goto('/ranch/nobody_home_zzz');
    const missingText = await anonPage.getByRole('main').innerText();
    expect(hidden?.status()).toBe(missing?.status());
    expect(hiddenText).toBe(missingText);
    expect(hiddenText).toMatch(/Step inside to visit this Ranch/);
    expect(hiddenText).not.toContain(a.handle);

    // Open the Ranch to everyone (Signal still members-only): signed-out sees the Ranch but NOT the Signal.
    await saveBoundaries(a.page, 'everyone', 'members');
    await anonPage.goto(`/ranch/${a.handle}`);
    await expect(anonPage.getByRole('heading', { level: 1, name: a.handle })).toBeVisible();
    await expect(anonPage.getByText('Members-only vibe')).toHaveCount(0);
    await expect(signalOn(b.page, 'Members-only vibe')).toBeVisible(); // members still do, after a reload:
    await b.page.reload();
    await expect(signalOn(b.page, 'Members-only vibe')).toBeVisible();

    // Signal to posse: the Ranch stays open, but members no longer see the Signal (nor does the page leak it anywhere).
    await saveBoundaries(a.page, 'everyone', 'posse');
    await b.page.reload();
    await expect(b.page.getByRole('heading', { level: 1, name: a.handle })).toBeVisible();
    await expect(b.page.getByText('Members-only vibe')).toHaveCount(0);
    expect(await b.page.content()).not.toContain('Members-only vibe');
    await a.page.goto(`/ranch/${a.handle}`);
    await expect(signalOn(a.page, 'Members-only vibe').filter({ hasText: /h left/ })).toBeVisible(); // owner still sees it

    // Ranch to posse: a signed-in stranger now gets a real 404, and a signed-out visitor the generic prompt.
    await saveBoundaries(a.page, 'posse', 'posse');
    const notFound = await b.page.goto(`/ranch/${a.handle}`);
    expect(notFound?.status()).toBe(404);
    await expect(b.page.getByRole('heading', { level: 1, name: a.handle })).toHaveCount(0);
    await anonPage.goto(`/ranch/${a.handle}`);
    await expect(anonPage.getByRole('main')).toContainText('Step inside to visit this Ranch');

    // The owner can always open their own Ranch.
    await a.page.goto(`/ranch/${a.handle}`);
    await expect(a.page.getByRole('heading', { level: 1, name: a.handle })).toBeVisible();

    await Promise.all([a.ctx.close(), b.ctx.close(), anon.close()]);
  });

  test('the Workshop and the API refuse signed-out visitors', async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto('/workshop');
    await expect(page).toHaveURL(/\/step-inside$/);
    expect((await ctx.request.get('/api/me/ranch')).status()).toBe(401);
    expect(
      (
        await ctx.request.patch('/api/me/ranch', {
          data: { displayName: 'x' },
          headers: { origin: 'http://localhost:3300' },
        })
      ).status(),
    ).toBe(401);
    await ctx.close();
  });
});

test.describe('Ranch and Workshop: accessibility and layout in a real browser', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations, including real colour contrast (${scheme})`, async ({ browser }) => {
      const a = await person(browser, `axe${scheme[0]}`, { colorScheme: scheme, bypassCSP: true });
      const source = axeSource();
      for (const path of [`/ranch/${a.handle}`, '/workshop', '/home', '/ranch/nobody_home_zzz']) {
        await a.page.goto(path);
        await a.page.evaluate(() => document.fonts.ready);
        await a.page.addScriptTag({ content: source });
        const violations = await a.page.evaluate(async () => {
          const axe = (
            window as unknown as {
              axe: {
                run: () => Promise<{
                  violations: { id: string; help: string; nodes: { target: string[] }[] }[];
                }>;
              };
            }
          ).axe;
          return (await axe.run()).violations.map(
            (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
          );
        });
        expect(violations, `${path} (${scheme})`).toEqual([]);
      }
      await a.ctx.close();
    });
  }

  test('no horizontal scroll at 320px and every control is at least 44px on touch', async ({ browser }) => {
    const a = await person(browser, 'small', {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 700 },
    });
    for (const path of [`/ranch/${a.handle}`, '/workshop', '/home']) {
      await a.page.goto(path);
      expect(await horizontalOverflow(a.page), `${path} overflow`).toBeLessThanOrEqual(0);
      const small = await a.page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(
          'button, a[href], select, textarea, input:not([type="radio"])',
        )) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || el.closest('.sr-only')) continue;
          const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
          if (!inline && r.height < 43.5)
            out.push(
              `${el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.height)}px`,
            );
        }
        return out;
      });
      expect(small, `${path} small targets`).toEqual([]);
    }
    await a.ctx.close();
  });
});
