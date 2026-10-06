import { expect, test } from '@playwright/test';
import {
  axeSource,
  horizontalOverflow,
  confirmEmailVia,
  linkFrom,
  newContext,
  pathOf,
  signUpVia,
  stepInsideVia,
  uniqueAccount,
  waitForMail,
  watchProblems,
  pageReady,
} from './helpers';

test.describe('authentication journey (production build, real CSP, real cookies)', () => {
  test('sign up → confirm email → step inside → stay signed in → hit the trail', async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const problems = await watchProblems(page);
    const a = uniqueAccount('walker');

    // A stranger's first stop is the welcome page; its main button leads to Stake a Claim.
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome$/);
    await page
      .locator('#main')
      .getByRole('link', { name: /^Stake a Claim/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/stake-a-claim$/);

    await signUpVia(page, a);

    // Not confirmed yet: the door stays shut, with a clear (and non-leaky) reason.
    await stepInsideVia(page, a.email, a.password);
    await expect(page.locator('main [role="alert"]')).toContainText(/confirm your email/i);
    await expect(page).toHaveURL(/\/step-inside$/);

    await confirmEmailVia(page, a.email);
    await stepInsideVia(page, a.handle, a.password); // by call sign this time
    await expect(page).toHaveURL(/\/home$/);
    // Home greets by display name (which defaults to the call sign) and still names the call sign.
    await expect(page.getByRole('heading', { name: `Howdy, ${a.handle}` })).toBeVisible();
    await expect(page.locator('main').getByText(`@${a.handle}`, { exact: true })).toBeVisible();
    // "At a glance": four numbers, each a way into the page with the detail.
    const glance = page.getByRole('region', { name: 'At a glance' });
    for (const href of ['/whispers', '/chimes', '/pals', '/tracks'])
      await expect(glance.locator(`a[href="${href}"]`)).toBeVisible();

    // The session cookie: HttpOnly, Secure, __Host- prefixed, SameSite=Lax, site-wide, and invisible to page scripts.
    const session = (await ctx.cookies()).find((c) => c.name === '__Host-howdy_session');
    expect(session, 'session cookie').toBeDefined();
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    expect(session!.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await page.evaluate(() => document.cookie)).not.toContain('howdy_session');

    // Persistence: a reload, and visiting signed-out pages, keep you inside.
    await page.reload();
    await expect(page.getByRole('heading', { name: /^Howdy, / })).toBeVisible();
    await page.goto('/step-inside');
    await expect(page).toHaveURL(/\/home$/);

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/gate$/);
    expect((await ctx.cookies()).find((c) => c.name === '__Host-howdy_session')).toBeUndefined();
    await page.goto('/home');
    await expect(page).toHaveURL(/\/step-inside$/);

    expect(problems).toEqual([]);
    await ctx.close();
  });

  test('a wrong password and an unknown account look exactly the same, and the error is announced', async ({
    browser,
  }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const a = uniqueAccount('sameerr');
    await signUpVia(page, a);
    await confirmEmailVia(page, a.email);

    await stepInsideVia(page, a.email, 'not the right password');
    const wrong = page.locator('main [role="alert"]');
    await expect(wrong).toBeVisible();
    await expect(wrong).toBeFocused();
    const wrongText = await wrong.innerText();

    await stepInsideVia(page, 'nobody.here@example.com', 'not the right password');
    const unknown = page.locator('main [role="alert"]');
    await expect(unknown).toBeVisible();
    expect(await unknown.innerText()).toBe(wrongText);
    expect(wrongText).toMatch(/isn.t right/);
    await ctx.close();
  });

  test('client-side validation guides the user, and the server still enforces the same rules', async ({
    browser,
  }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto('/stake-a-claim');
    await page.getByRole('button', { name: 'Create My Account' }).click();
    await expect(page.getByLabel('Choose a handle')).toBeFocused();
    await expect(page.getByLabel('Choose a handle')).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Choose a handle').fill('admin');
    await page.getByLabel('Email address').fill('x@example.com');
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Create My Account' }).click();
    await expect(page.getByText('That call sign is reserved.')).toBeVisible();
    await expect(page.getByText(/at least 10 characters/i).first()).toBeVisible();

    // Bypass the browser entirely: the API rejects the same input with the same reasons.
    const res = await ctx.request.post('/api/auth/signup', {
      data: { email: 'x@example.com', handle: 'admin', password: 'short' },
      headers: { origin: 'http://localhost:3300' },
    });
    expect(res.status()).toBe(422);
    await ctx.close();
  });

  test('a malformed email is flagged on leaving the box, kept as typed, never sent, and refused by the API too', async ({
    browser,
  }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const posts: string[] = [];
    page.on(
      'request',
      (r) => r.method() === 'POST' && r.url().includes('/api/auth/signup') && posts.push(r.url()),
    );
    await page.goto('/stake-a-claim');
    const email = page.getByLabel('Email address');

    // Leaving the box shows the problem straight away, marks the box, and keeps what was typed.
    await email.fill('test@gmail');
    await email.blur();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveValue('test@gmail');

    // Submitting with it still wrong sends nothing and puts you back in the email box.
    await page.getByLabel('Choose a handle').fill('mail_check');
    await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create My Account' }).click();
    await expect(email).toBeFocused();
    expect(posts).toEqual([]);

    // Fixing it clears the error as you type.
    await email.fill('test@gmail.com');
    await expect(page.getByText('Enter a valid email address.')).toHaveCount(0);
    await expect(email).not.toHaveAttribute('aria-invalid', 'true');

    // A crafted request with no form in front gets a structured field error, not an account.
    const res = await ctx.request.post('/api/auth/signup', {
      data: {
        email: 'user@localhost',
        handle: 'mail_check2',
        password: 'correct horse battery staple',
        acceptTerms: true,
      },
      headers: { origin: 'http://localhost:3300' },
    });
    expect(res.status()).toBe(422);
    expect(((await res.json()) as { error: { fields: { email: string } } }).error.fields.email).toBe(
      'Enter a valid email address.',
    );
    await ctx.close();
  });

  test('protected pages and APIs refuse signed-out visitors', async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto('/home');
    await expect(page).toHaveURL(/\/step-inside$/);
    expect((await ctx.request.get('/api/auth/me')).status()).toBe(401);
    expect((await ctx.request.get('/api/auth/sessions')).status()).toBe(401);
    // Cross-site state changes are refused even before authentication is considered.
    const forged = await ctx.request.post('/api/auth/logout-all', {
      headers: { origin: 'https://evil.example' },
      data: {},
    });
    expect(forged.status()).toBe(403);
    await ctx.close();
  });

  test('lost key: request a link, choose a new knock, old knock stops working, every device is signed out', async ({
    browser,
  }) => {
    const a = uniqueAccount('lostkey');
    const other = await newContext(browser);
    const otherPage = await other.newPage();
    await signUpVia(otherPage, a);
    await confirmEmailVia(otherPage, a.email);
    await stepInsideVia(otherPage, a.email, a.password);
    await expect(otherPage).toHaveURL(/\/home$/);

    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const problems = await watchProblems(page);
    await page.goto('/lost-your-key');
    await page.getByLabel('Email').fill(a.email);
    await page.getByRole('button', { name: 'Send the link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    const mail = await waitForMail(a.email, /reset/i);
    expect(mail.subject).toMatch(/reset/i);
    await page.goto(pathOf(linkFrom(mail.text)));
    // Weak knock is refused without burning the link.
    await page.getByLabel('New password').fill('short');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByText(/at least 10 characters/i).first()).toBeVisible();
    const newPassword = 'a brand new passphrase 42';
    await page.getByLabel('New password').fill(newPassword);
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible();

    // The link is single-use.
    await page.goto(pathOf(linkFrom(mail.text)));
    await page.getByLabel('New password').fill('yet another passphrase 43');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.locator('main [role="alert"]')).toContainText(/invalid or has expired/i);

    // The session on the other device is gone; the old knock no longer works; the new one does.
    await otherPage.reload();
    await expect(otherPage).toHaveURL(/\/step-inside$/);
    await stepInsideVia(page, a.email, a.password);
    await expect(page.locator('main [role="alert"]')).toBeVisible();
    await stepInsideVia(page, a.email, newPassword);
    await expect(page).toHaveURL(/\/home$/);
    expect(problems).toEqual([]);
    await ctx.close();
    await other.close();
  });

  test('Open Gates: close another device from this one', async ({ browser }) => {
    const a = uniqueAccount('gates');
    const first = await newContext(browser);
    const p1 = await first.newPage();
    await signUpVia(p1, a);
    await confirmEmailVia(p1, a.email);
    await stepInsideVia(p1, a.email, a.password);
    await expect(p1).toHaveURL(/\/home$/);

    const second = await newContext(browser);
    const p2 = await second.newPage();
    await stepInsideVia(p2, a.email, a.password);
    await expect(p2).toHaveURL(/\/home$/);

    await p1.reload();
    const gates = p1.getByRole('region', { name: 'Open Gates' });
    await expect(gates.getByRole('listitem')).toHaveCount(2);
    await expect(gates.getByText('This device')).toHaveCount(1);
    await gates.getByRole('button', { name: /Close gate on/ }).click();
    await expect(gates.getByText('Where you are signed in · 1 device')).toBeVisible();
    await expect(gates.getByRole('listitem')).toHaveCount(1);

    await p2.reload();
    await expect(p2).toHaveURL(/\/step-inside$/);
    await p1.reload();
    await expect(p1.getByRole('heading', { name: /^Howdy, / })).toBeVisible(); // this device stays inside
    await first.close();
    await second.close();
  });

  test('"sign out everywhere" asks first, then signs out this device', async ({ browser }) => {
    const a = uniqueAccount('everywhere');
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await signUpVia(page, a);
    await confirmEmailVia(page, a.email);
    await stepInsideVia(page, a.email, a.password);
    await page.getByRole('button', { name: 'Sign out everywhere…' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Sign out of every device?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused(); // the safe choice is the default
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/home$/); // cancelling changed nothing
    await page.getByRole('button', { name: 'Sign out everywhere…' }).click();
    await dialog.getByRole('button', { name: 'Sign out everywhere' }).click();
    await expect(page).toHaveURL(/\/gate$/);
    await ctx.close();
  });
});

test.describe('signed-out pages: accessibility and layout in a real browser', () => {
  const pages = [
    '/gate',
    '/stake-a-claim',
    '/step-inside',
    '/lost-your-key',
    '/verify',
    '/lost-your-key/reset',
  ];

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations, including real colour contrast (${scheme})`, async ({ browser }) => {
      // bypassCSP only so axe can be injected; the CSP itself is exercised by every other test in this file.
      const ctx = await newContext(browser, { colorScheme: scheme, bypassCSP: true });
      const page = await ctx.newPage();
      const source = axeSource();
      for (const path of pages) {
        await page.goto(path);
        await pageReady(page);
        await page.evaluate(() => document.fonts.ready);
        await page.addScriptTag({ content: source });
        const violations = await page.evaluate(async () => {
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
      await ctx.close();
    });
  }

  test('no horizontal scroll at 320px, and every control is at least 44px tall on touch', async ({
    browser,
  }) => {
    const ctx = await newContext(browser, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 700 },
    });
    const page = await ctx.newPage();
    for (const path of pages) {
      await page.goto(path);
      await pageReady(page);
      expect(await horizontalOverflow(page), `${path} overflow`).toBeLessThanOrEqual(0);
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (el.classList.contains('sr-only') || el.closest('.sr-only')) continue;
          // In-sentence text links are exempt (WCAG 2.5.8 inline exception); standalone controls are not.
          const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
          // A checkbox or radio is also toggled by tapping its label, so the label is the real target.
          const input = el as HTMLInputElement;
          const labelled =
            (input.type === 'checkbox' || input.type === 'radio') &&
            [...(input.labels ?? [])].some((l) => l.getBoundingClientRect().height >= 43.5);
          if (!inline && !labelled && r.height < 43.5)
            out.push(
              `${el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.height)}px`,
            );
        }
        return out;
      });
      expect(small, `${path} small targets`).toEqual([]);
    }
    await ctx.close();
  });

  test('the sign-in pages’ top bar is just the logo, centred', async ({ browser }) => {
    const ctx = await newContext(browser, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 360, height: 700 },
    });
    const page = await ctx.newPage();
    for (const path of pages) {
      await page.goto(path);
      await pageReady(page);
      const bar = page.getByRole('banner');
      await expect(bar.getByRole('link')).toHaveCount(1);
      const logo = (await bar.getByRole('link', { name: 'Howdy' }).boundingBox())!;
      expect(Math.abs(logo.x + logo.width / 2 - 180), `${path} logo centred`).toBeLessThanOrEqual(2);
    }
    await ctx.close();
  });

  for (const width of [320, 360]) {
    test(`elsewhere signed out, the top bar's two ways in are equal, on one line each, and fit at ${width}px`, async ({
      browser,
    }) => {
      // A Ranch opened without an account still offers the way in (only the sign-in pages drop it).
      const owner = await newContext(browser);
      const ownerPage = await owner.newPage();
      const a = uniqueAccount('pillfit');
      await signUpVia(ownerPage, a);
      await confirmEmailVia(ownerPage, a.email);
      await owner.close();
      const ctx = await newContext(browser, {
        hasTouch: true,
        isMobile: true,
        viewport: { width, height: 700 },
      });
      const page = await ctx.newPage();
      await page.goto(`/porch/${a.handle}`);
      const bar = page.getByRole('banner');
      const pills = [
        bar.getByRole('link', { name: /Step Inside/ }),
        bar.getByRole('link', { name: /Stake a Claim/ }),
      ];
      const boxes = await Promise.all(pills.map((p) => p.boundingBox()));
      expect(boxes[0]!.width).toBeCloseTo(boxes[1]!.width, 0);
      for (const box of boxes) expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      for (const pill of pills) {
        // Each line of text stays whole (no wrapping, no clipped overflow).
        const clipped = await pill.evaluate((el) =>
          [...el.querySelectorAll('span')].some(
            (s) => s.scrollWidth > s.clientWidth + 1 || s.getClientRects().length > 1,
          ),
        );
        expect(clipped).toBe(false);
        // The pill holds its text (it is not squeezed narrower than its words).
        expect(await pill.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      }
      // …and the pair fits its slot beside the logo (squeezing into the bar's side padding is not fitting).
      const pair = await pills[0]!.evaluate((el) => {
        const box = el.parentElement!;
        return { spill: box.scrollWidth - box.clientWidth, right: box.getBoundingClientRect().right };
      });
      expect(pair.spill).toBeLessThanOrEqual(0);
      expect(pair.right).toBeLessThanOrEqual(width - 16);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await ctx.close();
    });
  }

  test('one card, two tabs: switching forms in place, by click and by keyboard, and the address follows', async ({
    browser,
  }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const problems = await watchProblems(page);
    await page.goto('/step-inside');
    const signIn = page.getByRole('tab', { name: /Step Inside/ });
    const signUp = page.getByRole('tab', { name: /Stake a Claim/ });
    await expect(signIn).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Handle or email')).toBeVisible();

    await signUp.click();
    await expect(signUp).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Choose a handle')).toBeVisible();
    await expect(page.getByLabel('Handle or email')).toHaveCount(0);
    await expect(page).toHaveURL(/\/stake-a-claim$/);
    await expect(page).toHaveTitle(/^Stake a Claim/);

    // Arrow keys move between tabs (only the selected tab is in the Tab order).
    await signUp.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(signIn).toBeFocused();
    await expect(signIn).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/step-inside$/);
    await expect(signUp).toHaveAttribute('tabindex', '-1');

    // A refresh opens the tab the address names.
    await signUp.click();
    await page.reload();
    await expect(page.getByRole('tab', { name: /Stake a Claim/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Choose a handle')).toBeVisible();
    expect(problems).toEqual([]);
    await ctx.close();
  });
});
