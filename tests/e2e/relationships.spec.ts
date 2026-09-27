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
  pageReady,
} from './helpers';

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

/** `asker` asks `asked` to join their Posse and `asked` accepts — all through the UI. */
async function makePosse(asker: Person, asked: Person) {
  await asker.page.goto(`/porch/${asked.handle}`);
  await asker.page.getByRole('button', { name: 'Ask to be Pals' }).click();
  // The relationship bar says so at once; after the page refreshes the Ranch header's badge says it too.
  await expect(asker.page.getByText('Requested', { exact: true }).first()).toBeVisible();
  await asked.page.goto('/pals');
  await asked.page.getByRole('button', { name: `Accept ${asker.handle}` }).click();
  await expect(asked.page.getByRole('heading', { name: /^Pals \(1\)/ })).toBeVisible();
}

const openMore = async (page: Page) => {
  await page.getByRole('button', { name: /^More/ }).click();
};

test.describe('Posse, Block and Flag trouble (production build, real CSP)', () => {
  test('the Posse handshake, and a posse-only Ranch opening to the new member only', async ({ browser }) => {
    const a = await person(browser, 'owner');
    const b = await person(browser, 'friend');
    const c = await person(browser, 'stranger');
    const problems = await watchProblems(b.page);

    // Alice makes her Ranch posse-only. Bob (a stranger for now) cannot see it.
    await a.page.goto('/workshop');
    await a.page.getByLabel('Who can visit your Porch?').selectOption('posse');
    await a.page.getByLabel('Who can read your Signal?').selectOption('posse');
    await a.page.getByRole('button', { name: 'Save Boundary Lines' }).click();
    await expect(a.page.getByRole('status').filter({ hasText: 'Boundary Lines updated' })).toBeVisible();
    const before = await b.page.goto(`/porch/${a.handle}`);
    expect(before?.status()).toBe(404);

    // The Ranch is hidden, so Bob has no button there; he asks by call sign on his Posse page. The answer never says
    // whether the call sign exists. Alice then sees the request on Home and on /pals.
    await b.page.goto('/pals');
    await b.page.getByLabel('Their call sign').fill(`@${a.handle}`);
    await b.page.getByRole('button', { name: 'Ask to be Pals' }).click();
    await expect(b.page.getByText(`If @${a.handle} is out there`)).toBeVisible();
    await b.page.getByLabel('Their call sign').fill('nobody_home_zzz');
    await b.page.getByRole('button', { name: 'Ask to be Pals' }).click();
    await expect(b.page.getByText('If @nobody_home_zzz is out there')).toBeVisible(); // identical for a call sign that does not exist
    await a.page.goto('/home');
    await expect(a.page.getByRole('main').getByRole('link', { name: /Pals.*1 new/ })).toBeVisible();
    await a.page.getByRole('main').getByRole('link', { name: /Pals/ }).click();
    await expect(a.page.getByRole('heading', { name: 'Requests for you (1)' })).toBeVisible();
    await expect(a.page.getByText('wants to be your Pal')).toBeVisible();
    expect((await b.page.goto(`/porch/${a.handle}`))?.status()).toBe(404); // still hidden while pending

    await a.page.getByRole('button', { name: `Accept ${b.handle}` }).click();
    await expect(a.page.getByRole('heading', { name: /^Pals \(1\)/ })).toBeVisible();

    // Now Bob is in the Posse: the Ranch opens for him, with the relationship shown.
    const after = await b.page.goto(`/porch/${a.handle}`);
    expect(after?.status()).toBe(200);
    await expect(b.page.getByRole('heading', { level: 1, name: a.handle })).toBeVisible();
    await expect(b.page.locator('#main').getByText('Pals', { exact: true })).toBeVisible(); // the relationship badge

    // A stranger (Carol) still gets the ordinary 404.
    expect((await c.page.goto(`/porch/${a.handle}`))?.status()).toBe(404);
    await expect(c.page.getByRole('heading', { name: 'Nothing out here' })).toBeVisible();

    // Bob marks Alice close (private) and then leaves the Posse; the Ranch closes to him again.
    await b.page.getByRole('button', { name: 'Close Pal' }).click();
    await expect(b.page.getByRole('button', { name: 'Close Pal' })).toHaveAttribute('aria-pressed', 'true');
    await openMore(b.page);
    await b.page.getByRole('menuitem', { name: 'Stop being Pals…' }).click();
    await b.page
      .getByRole('alertdialog', { name: 'Stop being Pals?' })
      .getByRole('button', { name: 'Stop being Pals' })
      .click();
    await expect(b.page.getByRole('heading', { name: 'Nothing out here' })).toBeVisible();

    expect(problems).toEqual([]);
    await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
  });

  test('Block: hides both ways, is private, and can be undone from the Workshop', async ({ browser }) => {
    const a = await person(browser, 'blocker');
    const b = await person(browser, 'blocked');
    await makePosse(b, a); // Bob asked Alice, Alice accepted

    // Alice blocks Bob from his Ranch. It asks first, and says Bob is not told.
    await a.page.goto(`/porch/${b.handle}`);
    await openMore(a.page);
    await a.page.getByRole('menuitem', { name: 'Block…' }).click();
    const dialog = a.page.getByRole('alertdialog', { name: `Block @${b.handle}?` });
    await expect(dialog).toContainText('They are not told');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused(); // the safe choice first
    await dialog.getByRole('button', { name: 'Block', exact: true }).click();
    await expect(a.page).toHaveURL(/\/home$/);

    // Bob simply can no longer find Alice — the same "nothing out here" as a Ranch that does not exist.
    const seen = await b.page.goto(`/porch/${a.handle}`);
    expect(seen?.status()).toBe(404);
    const blockedText = await b.page.getByRole('main').innerText();
    await b.page.goto('/porch/nobody_home_zzz');
    expect(await b.page.getByRole('main').innerText()).toBe(blockedText);
    await b.page.goto('/pals');
    await expect(b.page.getByText(a.handle)).toHaveCount(0);

    // Alice's Workshop lists Bob as an Outlaw, with an undo; her Posse is empty.
    await a.page.goto('/workshop');
    await expect(a.page.getByRole('heading', { name: 'Blocked (Outlaws)' })).toBeVisible();
    await a.page.goto('/pals');
    await expect(a.page.getByText('No Pals yet')).toBeVisible();
    await a.page.goto('/workshop');
    await a.page.getByRole('button', { name: `Unblock ${b.handle}` }).click();
    await expect(a.page.getByText(/Nobody\. You can block/)).toBeVisible();

    // Unblocked: Bob can see Alice again (members-only is the default), but the Posse is gone.
    expect((await b.page.goto(`/porch/${a.handle}`))?.status()).toBe(200);
    await expect(b.page.getByRole('button', { name: 'Ask to be Pals' })).toBeVisible();
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });

  test('Flag trouble: sends a report, and repeating it looks exactly the same', async ({ browser }) => {
    const a = await person(browser, 'reporter');
    const b = await person(browser, 'reported');
    const send = async () => {
      await a.page.goto(`/porch/${b.handle}`);
      await openMore(a.page);
      await a.page.getByRole('menuitem', { name: 'Flag trouble…' }).click();
      const modal = a.page.getByRole('dialog', { name: `Flag trouble with @${b.handle}` });
      await expect(modal).toContainText('They are not told you sent it');
      await modal.getByLabel('What is going on?').selectOption('spam');
      await modal.getByLabel(/Anything we should know/).fill('Sends the same scam link to everyone.');
      await modal.getByRole('button', { name: 'Send report' }).click();
      await expect(
        a.page.getByRole('status').filter({ hasText: 'Thanks. We will take a look.' }),
      ).toBeVisible();
    };
    await send();
    await send(); // a second, identical report: same outcome from the reporter's point of view
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });

  test('menu and dialogs are keyboard operable', async ({ browser }) => {
    const a = await person(browser, 'kbd');
    const b = await person(browser, 'target');
    await a.page.goto(`/porch/${b.handle}`);
    const more = a.page.getByRole('button', { name: /^More/ });
    await more.focus();
    await a.page.keyboard.press('ArrowDown');
    await expect(a.page.getByRole('menuitem', { name: 'Turn down the noise' })).toBeFocused();
    await a.page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await a.page.keyboard.press('Enter');
    await a.page.keyboard.press('End');
    await a.page.keyboard.press('Enter'); // last item: Block…
    await expect(a.page.getByRole('alertdialog', { name: `Block @${b.handle}?` })).toBeVisible();
    await a.page.keyboard.press('Escape');
    await expect(a.page.getByRole('alertdialog')).toBeHidden();
    await expect(a.page).toHaveURL(new RegExp(`/porch/${b.handle}$`)); // cancelling changed nothing
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });

  test('the Posse pages and APIs refuse signed-out visitors', async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto('/pals');
    await expect(page).toHaveURL(/\/step-inside$/);
    // The old addresses still lead to the new ones: /posse to /pals (so, signed out, to Step Inside), /ranch to /porch.
    await page.goto('/posse');
    await expect(page).toHaveURL(/\/step-inside$/);
    await page.goto('/ranch/nobody_home_zzz');
    await expect(page).toHaveURL(/\/porch\/nobody_home_zzz$/);
    expect((await ctx.request.get('/api/me/relationships')).status()).toBe(401);
    expect(
      (
        await ctx.request.post('/api/reports', { data: {}, headers: { origin: 'http://localhost:3300' } })
      ).status(),
    ).toBe(401);
    await ctx.close();
  });
});

test.describe('Posse pages: accessibility and layout in a real browser', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations, including real colour contrast (${scheme})`, async ({ browser }) => {
      const a = await person(browser, `axe${scheme[0]}`, { colorScheme: scheme, bypassCSP: true });
      const b = await person(browser, `axeb${scheme[0]}`, { colorScheme: scheme, bypassCSP: true });
      const c = await person(browser, `axec${scheme[0]}`, { colorScheme: scheme, bypassCSP: true });
      await makePosse(b, a);
      await c.page.request.post(`/api/relationships/${a.handle}`, {
        data: { action: 'request' },
        headers: { origin: 'http://localhost:3300' },
      });
      await a.page.request.post(`/api/relationships/${c.handle}`, {
        data: { action: 'mute' },
        headers: { origin: 'http://localhost:3300' },
      });
      await a.page.request.post(`/api/relationships/${b.handle}`, {
        data: { action: 'scout' },
        headers: { origin: 'http://localhost:3300' },
      });
      const source = axeSource();
      for (const path of ['/pals', `/porch/${b.handle}`, '/workshop', '/home']) {
        await a.page.goto(path);
        await pageReady(a.page);
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
      await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
    });
  }

  test('no horizontal scroll at 320px and every control is at least 44px on touch', async ({ browser }) => {
    const a = await person(browser, 'smalla', {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 700 },
    });
    const b = await person(browser, 'smallb');
    await makePosse(b, a);
    for (const path of ['/pals', `/porch/${b.handle}`, '/workshop']) {
      await a.page.goto(path);
      await pageReady(a.page);
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
              `${el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 28)}" ${Math.round(r.height)}px`,
            );
        }
        return out;
      });
      expect(small, `${path} small targets`).toEqual([]);

      // Rows must never let their action buttons cover the person's name or handle (this once happened on phones).
      const overlaps = await a.page.evaluate(() => {
        const out: string[] = [];
        for (const li of document.querySelectorAll('li')) {
          const text = li.querySelector(':scope > div:not(.ml-auto)');
          const actions = li.querySelector(':scope > .ml-auto');
          if (!text || !actions) continue;
          const t = text.getBoundingClientRect();
          const r = actions.getBoundingClientRect();
          const x = Math.min(t.right, r.right) - Math.max(t.left, r.left);
          const y = Math.min(t.bottom, r.bottom) - Math.max(t.top, r.top);
          if (x > 1 && y > 1) out.push((li.textContent ?? '').slice(0, 40));
          // A box's rect does not include text spilling out of it, so also catch unbreakable text overflowing its box
          // (a long call sign is exactly what covered the buttons before).
          for (const span of li.querySelectorAll<HTMLElement>('span.block')) {
            if (span.scrollWidth > span.clientWidth + 1)
              out.push(`overflow: ${(span.textContent ?? '').slice(0, 40)}`);
          }
        }
        return out;
      });
      expect(overlaps, `${path} overlapping rows`).toEqual([]);
    }
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});
