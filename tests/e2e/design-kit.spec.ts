import { expect, test, type Page } from '@playwright/test';

const KIT = '/workshop/kit';

// Records every CSP violation and console error so a page that "looks fine" but is silently blocked still fails.
async function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`http ${r.status()}: ${r.url()}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      // Runs in the browser: surface it through the console so `watch` records it. (Not app code.)
      // eslint-disable-next-line no-console
      console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`),
    );
  });
  return problems;
}

const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('design kit (production build, real CSP)', () => {
  test('loads with no CSP violations or console errors, including after interaction', async ({ page }) => {
    const problems = await watch(page);
    const res = await page.goto(KIT);
    expect(res?.status()).toBe(200);
    expect(res?.headers()['content-security-policy']).toContain("script-src 'self' 'nonce-");
    await page.getByRole('button', { name: 'Modal', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Flip' }).first().click();
    await page.getByRole('button', { name: 'Toast', exact: true }).click();
    await expect(page.getByRole('status').first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('renders the brand fonts', async ({ page }) => {
    await page.goto(KIT);
    await page.evaluate(() => document.fonts.ready);
    const families = await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontFamily,
      display: getComputedStyle(document.querySelector('h1')!).fontFamily,
    }));
    expect(families.body).toMatch(/Jakarta/);
    expect(families.display).toMatch(/Fraunces/);
    const loaded = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    );
    expect(loaded.join(' ')).toMatch(/Jakarta/);
  });

  test('follows the system colour scheme, and the toggle forces Daylight/Dusk and persists across reload', async ({
    browser,
  }) => {
    const light = await browser.newContext({ colorScheme: 'light' });
    const lp = await light.newPage();
    await lp.goto(KIT);
    expect(await bg(lp)).toBe('rgb(248, 245, 238)'); // Canvas Cream
    await light.close();

    const dark = await browser.newContext({ colorScheme: 'dark' });
    const dp = await dark.newPage();
    await dp.goto(KIT);
    expect(await bg(dp)).toBe('rgb(30, 27, 46)'); // Dusk
    // Force Daylight while the system is dark.
    await dp.getByRole('button', { name: 'Daylight' }).click();
    expect(await bg(dp)).toBe('rgb(248, 245, 238)');
    await dp.reload();
    await expect(dp.locator('html')).toHaveAttribute('data-theme', 'daylight'); // server-rendered from the cookie
    expect(await bg(dp)).toBe('rgb(248, 245, 238)');
    await dp.getByRole('button', { name: 'System' }).click();
    await expect(dp.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    expect(await bg(dp)).toBe('rgb(30, 27, 46)');
    await dark.close();
  });

  test('modal: focus moves in, Escape closes, focus returns to the trigger', async ({ page }) => {
    await page.goto(KIT);
    const trigger = page.getByRole('button', { name: 'Modal', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Tend the Ranch' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('menu is fully keyboard operable', async ({ page }) => {
    await page.goto(KIT);
    const trigger = page.getByRole('button', { name: /^Menu/ });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Scrape clean' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Turn down the noise' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('Post Card flips to its back; only the visible face exists and focus follows', async ({ page }) => {
    await page.goto(KIT);
    const card = page.getByRole('article', { name: 'Post Card from Sneha Roy' });
    await expect(card.getByText('Bringing coffee down now.')).toHaveCount(0); // back not rendered yet
    await card.getByRole('button', { name: /Flip/ }).click();
    await expect(card.getByRole('heading', { name: 'Scribbles' })).toBeVisible();
    await expect(card.getByText('Bringing coffee down now.')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Back to card' })).toBeFocused();
    // The flip is a real, named animation on the newly shown face.
    const anim = await card.locator('> div').evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('flip-in');
    await card.getByRole('button', { name: 'Back to card' }).click();
    await expect(card.getByText('Are we hitting the late-night canteen run')).toBeVisible();
    await expect(card.getByRole('button', { name: /Flip/ })).toBeFocused();
  });

  test('a Post Card is only as tall as its own content (no dead space from the hidden face)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(KIT);
    const box = await page.getByRole('article', { name: 'Post Card from Rahul Das' }).boundingBox();
    expect(box!.height).toBeLessThan(220);
  });

  test('reduced motion removes the flip animation', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(KIT);
    const card = page.getByRole('article', { name: 'Post Card from Sneha Roy' });
    await card.getByRole('button', { name: /Flip/ }).click();
    const duration = await card.locator('> div').evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(duration)).toBeLessThan(0.01);
    await ctx.close();
  });

  test('no horizontal scroll at 320px wide, and the mobile bottom bar appears/disappears with width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(KIT);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();
  });

  test('every button, tab, switch and link is at least 44px tall on a touch device', async ({ browser }) => {
    const ctx = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await page.goto(KIT);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const sel = 'button, [role="tab"], [role="switch"], a[href]:not(.sr-only)';
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue; // hidden
        if (el.closest('[inert]')) continue;
        if (r.height < 43.5 && !(el.getAttribute('role') === 'switch' && r.height >= 32)) {
          out.push(
            `${el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }
      return out;
    });
    expect(small).toEqual([]);
    await ctx.close();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`screenshots (${scheme})`, async ({ browser }, info) => {
      const ctx = await browser.newContext({
        colorScheme: scheme,
        viewport: { width: 390, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      await page.goto(KIT);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: info.outputPath(`kit-${scheme}-mobile-full.png`), fullPage: true });
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.screenshot({ path: info.outputPath(`kit-${scheme}-desktop-top.png`) });
      await ctx.close();
    });
  }
});
