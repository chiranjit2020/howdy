import { expect, test, type Browser } from '@playwright/test';
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

async function makePosse(asker: Person, asked: Person) {
  expect((await api(asker, `/api/relationships/${asked.handle}`, { action: 'request' })).ok()).toBe(true);
  expect((await api(asked, `/api/relationships/${asker.handle}`, { action: 'accept' })).ok()).toBe(true);
}

/** Tracks are written after the response: poll the owner's list instead of racing it. */
async function tracksOf(p: Person) {
  return (await (await p.page.request.get('/api/me/tracks')).json()) as {
    frozen: boolean;
    people: { handle: string; when: string }[];
    hidden: { today: number; yesterday: number; 'this-week': number };
  };
}

test.describe('Tracks in a real browser (production build, real CSP)', () => {
  test('a Posse friend is named, a stranger is only a count, lists leave no footprints, Shadow Walk works both ways', async ({
    browser,
  }) => {
    const a = await person(browser, 'tra');
    const friend = await person(browser, 'trb');
    const stranger = await person(browser, 'trc');
    const bystander = await person(browser, 'trd');
    await makePosse(friend, a);
    await api(a, '/api/me/ranch', { ranchVisibility: 'everyone' }, 'PATCH');
    const problems = await watchProblems(a.page);

    // Lists and headers link to Ranches; merely rendering them must never count as a visit.
    await bystander.page.goto('/home');
    await bystander.page.goto('/posse');
    await bystander.page.goto('/whispers');
    await a.page.waitForTimeout(800);
    expect((await tracksOf(a)).hidden).toEqual({ today: 0, yesterday: 0, 'this-week': 0 });

    // Real visits: only opening the Ranch counts.
    await friend.page.goto(`/ranch/${a.handle}`);
    await stranger.page.goto(`/ranch/${a.handle}`);
    await expect.poll(async () => (await tracksOf(a)).hidden.today).toBe(1);

    await a.page.goto('/home');
    await a.page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Tracks' }).click();
    await expect(a.page.getByRole('heading', { name: 'Tracks', level: 1 })).toBeVisible();
    await expect(a.page.getByRole('heading', { name: 'Your Posse dropped by' })).toBeVisible();
    const named = a.page.getByRole('list').filter({ hasText: friend.handle });
    await expect(named).toContainText('Today');
    await expect(a.page.getByText('Hidden track')).toBeVisible();
    // Nothing else about the stranger is anywhere on the page.
    expect(await a.page.content()).not.toContain(stranger.handle);
    // …and no time of day anywhere on it.
    expect(await a.page.locator('main').innerText()).not.toMatch(/\d{1,2}:\d{2}/);

    // Shadow Walk on: a shadowed visit leaves nothing, and the visitor's own Tracks freeze.
    await bystander.page.goto('/tracks');
    await bystander.page.getByRole('switch', { name: /^Shadow Walk/ }).click();
    await expect(bystander.page.getByRole('status').filter({ hasText: 'Shadow Walk is on' })).toBeVisible();
    await expect(bystander.page.getByRole('heading', { name: 'Your Tracks are frozen' })).toBeVisible();
    await bystander.page.goto(`/ranch/${a.handle}`);
    await a.page.waitForTimeout(1200);
    expect((await tracksOf(a)).hidden.today).toBe(1); // still just the stranger

    // Off again: the next visit is recorded.
    await bystander.page.goto('/tracks');
    await bystander.page.getByRole('switch', { name: /^Shadow Walk/ }).click();
    await expect(bystander.page.getByRole('status').filter({ hasText: 'Shadow Walk is off' })).toBeVisible();
    await bystander.page.goto(`/ranch/${a.handle}`);
    await expect.poll(async () => (await tracksOf(a)).hidden.today).toBe(2);

    // The owner on Shadow Walk sees a frozen page, not the list.
    await api(a, '/api/me/ranch', { shadowWalk: true }, 'PATCH');
    await a.page.reload();
    await expect(a.page.getByRole('heading', { name: 'Your Tracks are frozen' })).toBeVisible();
    await expect(a.page.getByText('Your Posse dropped by')).toHaveCount(0);

    expect(problems).toEqual([]);
    await Promise.all([a.ctx.close(), friend.ctx.close(), stranger.ctx.close(), bystander.ctx.close()]);
  });

  test('a blocked visitor and a muted visitor vanish from the list', async ({ browser }) => {
    const a = await person(browser, 'tre');
    const b = await person(browser, 'trf');
    const c = await person(browser, 'trg');
    await api(a, '/api/me/ranch', { ranchVisibility: 'everyone' }, 'PATCH');
    await b.page.goto(`/ranch/${a.handle}`);
    await c.page.goto(`/ranch/${a.handle}`);
    await expect.poll(async () => (await tracksOf(a)).hidden.today).toBe(2);
    await api(a, `/api/relationships/${b.handle}`, { action: 'block' });
    await api(a, `/api/relationships/${c.handle}`, { action: 'mute' });
    await a.page.goto('/tracks');
    await expect(a.page.getByText('No Tracks this week')).toBeVisible();
    await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
  });
});

test.describe('Tracks: accessibility and layout in a real browser', () => {
  async function seed(browser: Browser, opts: Parameters<typeof newContext>[1]) {
    const a = await person(browser, `ta${Date.now().toString(36).slice(-4)}`, opts);
    const b = await person(browser, `tb${Date.now().toString(36).slice(-4)}`, opts);
    const c = await person(browser, `tc${Date.now().toString(36).slice(-4)}`, opts);
    await makePosse(b, a);
    await api(a, '/api/me/ranch', { ranchVisibility: 'everyone' }, 'PATCH');
    await b.page.goto(`/ranch/${a.handle}`);
    await c.page.goto(`/ranch/${a.handle}`);
    await expect.poll(async () => (await tracksOf(a)).people.length).toBe(1);
    await expect.poll(async () => (await tracksOf(a)).hidden.today).toBe(1);
    return { a, b, c };
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations, including real colour contrast (${scheme})`, async ({ browser }) => {
      const { a, b, c } = await seed(browser, {
        colorScheme: scheme,
        bypassCSP: true,
        reducedMotion: 'reduce',
      });
      const source = axeSource();
      for (const shadow of [false, true]) {
        await api(a, '/api/me/ranch', { shadowWalk: shadow }, 'PATCH');
        await a.page.goto('/tracks');
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
        expect(violations, `/tracks shadow=${shadow} (${scheme})`).toEqual([]);
      }
      await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
    });
  }

  test('no horizontal scroll at 320px and every control is at least 44px on touch', async ({ browser }) => {
    const { a, b, c } = await seed(browser, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 700 },
    });
    await a.page.goto('/tracks');
    expect(await horizontalOverflow(a.page)).toBeLessThanOrEqual(0);
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
      for (const p of document.querySelectorAll<HTMLElement>('main li p, main li span')) {
        if (p.scrollWidth > p.clientWidth + 1 && !p.classList.contains('truncate') && !p.closest('.sr-only'))
          out.push(`text overflows: ${(p.textContent ?? '').slice(0, 30)}`);
      }
      return out;
    });
    expect(problems).toEqual([]);
    await Promise.all([a.ctx.close(), b.ctx.close(), c.ctx.close()]);
  });
});
