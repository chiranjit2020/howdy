import { expect, test, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Pool } from 'pg';
import {
  axeSource,
  confirmEmailVia,
  horizontalOverflow,
  newContext,
  signUpVia,
  stepInsideVia,
  uniqueAccount,
  watchProblems,
} from './helpers';

const PAGES = [
  { path: '/privacy', title: 'Privacy Policy' },
  { path: '/terms', title: 'Terms of Service' },
  { path: '/campfire-rules', title: 'Campfire Rules' },
  { path: '/cookies', title: 'Cookie Policy' },
];

/** The e2e server's own (local) database, to simulate an account from before acceptance was tracked. */
const db = new Pool({ connectionString: parse(readFileSync('.env.local')).E2E_DATABASE_URL, max: 1 });
test.afterAll(() => db.end());

async function person(browser: Browser, tag: string) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}

test.describe('Legal pages (production build, real CSP)', () => {
  test('each page opens signed out, shows its version and dates, with a contents list and the footer', async ({
    browser,
  }) => {
    const ctx = await newContext(browser, { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problems = await watchProblems(page);
    for (const p of PAGES) {
      const res = await page.goto(p.path);
      expect(res?.status(), p.path).toBe(200);
      await expect(page).toHaveTitle(`${p.title} · Howdy`);
      await expect(page.getByRole('heading', { level: 1, name: p.title })).toBeVisible();
      await expect(page.getByText(/^Version \d+\.\d+\.\d+$/)).toBeVisible();
      await expect(page.getByText('Effective')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'On this page' })).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${p.path}$`));
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        'content',
        `${p.title} · Howdy`,
      );
      // exactly one h1, and sections are h2 (no skipped levels)
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await page.locator('main h2').count()).toBeGreaterThanOrEqual(4);
      expect(await page.locator('main h4, main h5, main h6').count()).toBe(0);
      // the footer, on every page
      const legal = page.getByRole('navigation', { name: 'Legal' });
      for (const q of PAGES)
        await expect(legal.getByRole('link', { name: new RegExp(q.title.split(' ')[0]!) })).toBeVisible();
    }
    // The footer is on the sign-in pages too.
    await page.goto('/step-inside');
    await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    expect(problems).toEqual([]);
    await ctx.close();
  });

  test('keyboard: the contents list jumps to a section and moves focus there', async ({ browser }) => {
    const ctx = await newContext(browser, {
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    await page.goto('/privacy');
    const toc = page.getByRole('navigation', { name: 'On this page' });
    const link = toc.getByRole('link', { name: 'Tracks and Shadow Walk' });
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#tracks-and-shadow-walk$/);
    await expect(page.locator('#tracks-and-shadow-walk')).toBeFocused();
    await expect(link).toHaveAttribute('aria-current', 'location');
    await ctx.close();
  });

  test('phones and tablets: a fold-out contents list, and nothing scrolls sideways', async ({ browser }) => {
    for (const viewport of [
      { width: 320, height: 700 },
      { width: 768, height: 1024 },
    ]) {
      const ctx = await newContext(browser, { viewport, hasTouch: true, isMobile: viewport.width < 400 });
      const page = await ctx.newPage();
      for (const p of PAGES) {
        await page.goto(p.path);
        expect(await horizontalOverflow(page), `${p.path} @${viewport.width}`).toBe(0);
      }
      await page.goto('/terms');
      await page.locator('summary', { hasText: 'On this page' }).click();
      await page.locator('details').getByRole('link', { name: 'Your content' }).click();
      await expect(page).toHaveURL(/#your-content$/);
      await ctx.close();
    }
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations (${scheme})`, async ({ browser }) => {
      const ctx = await newContext(browser, { colorScheme: scheme, bypassCSP: true });
      const page = await ctx.newPage();
      const source = axeSource();
      for (const p of [...PAGES.map((x) => x.path), '/stake-a-claim']) {
        await page.goto(p);
        await page.evaluate(() => document.fonts.ready);
        await page.addScriptTag({ content: source });
        const violations = await page.evaluate(async () => {
          const axe = (
            window as unknown as {
              axe: { run: () => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> };
            }
          ).axe;
          return (await axe.run()).violations.map(
            (v) => `${v.id} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
          );
        });
        expect(violations, `${p} (${scheme})`).toEqual([]);
      }
      await ctx.close();
    });
  }
});

test.describe('Agreeing (production build)', () => {
  test('Stake a Claim will not go ahead until the box is ticked', async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const a = uniqueAccount('untick');
    await page.goto('/stake-a-claim');
    await page.getByLabel('Choose a handle').fill(a.handle);
    await page.getByLabel('Email address').fill(a.email);
    await page.getByLabel('Password', { exact: true }).fill(a.password);
    await page.getByRole('button', { name: 'Create My Account' }).click();
    await expect(page.getByText(/confirm you are 18 or older/).first()).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /I am 18 or older/ })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toHaveCount(0);
    // The links in the label open in a new tab, so the half-filled form is kept.
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('target', '_blank');
    await page.getByRole('checkbox', { name: /I am 18 or older/ }).check();
    await page.getByRole('button', { name: 'Create My Account' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await ctx.close();
  });

  test('an account that has not agreed is asked once, can still read the documents, then carries on', async ({
    browser,
  }) => {
    const a = await person(browser, 'oldtimer');
    await db.query('delete from legal_acceptances where user_id = (select id from users where handle = $1)', [
      a.handle,
    ]);

    await a.page.goto('/home');
    await expect(a.page).toHaveURL(/\/agree$/);
    await expect(a.page.getByRole('heading', { level: 1, name: 'A few ground rules' })).toBeVisible();
    await a.page.goto(`/porch/${a.handle}`);
    await expect(a.page).toHaveURL(/\/agree$/);
    // …but the documents themselves are open to read.
    await a.page.goto('/terms');
    await expect(a.page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();

    await a.page.goto('/agree');
    await a.page.getByRole('button', { name: 'Agree and carry on' }).click();
    await expect(a.page.getByText(/confirm you are 18 or older/).first()).toBeVisible();
    await a.page.getByRole('checkbox', { name: /I am 18 or older/ }).check();
    await a.page.getByRole('button', { name: 'Agree and carry on' }).click();
    await expect(a.page).toHaveURL(/\/home$/);

    // Asked once: afterwards /agree just sends them home.
    await a.page.goto('/agree');
    await expect(a.page).toHaveURL(/\/home$/);
    const rows = await db.query(
      'select document from legal_acceptances where user_id = (select id from users where handle = $1) order by 1',
      [a.handle],
    );
    expect(rows.rows.map((r) => r.document)).toEqual(['privacy', 'terms']);
    await a.ctx.close();
  });
});
