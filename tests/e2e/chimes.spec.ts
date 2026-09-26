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

/** Chimes are rung after the response, so give them a moment instead of racing them. */
async function untilUnread(p: Person, n: number) {
  await expect
    .poll(
      async () =>
        ((await (await p.page.request.get('/api/me/chimes/unread')).json()) as { unread: number }).unread,
      {
        timeout: 10_000,
      },
    )
    .toBe(n);
}

const bellLink = (page: Page) =>
  page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Chimes/ });

test.describe('Chimes in a real browser (production build, real CSP)', () => {
  test('ring, badge, open, mark read, mute hides — and Chime settings switch a kind off', async ({
    browser,
  }) => {
    const a = await person(browser, 'bellowner');
    const b = await person(browser, 'bellfriend');
    const problems = await watchProblems(a.page);

    // Bob asks Alice into his Posse: Alice's bell rings.
    expect((await api(b, `/api/relationships/${a.handle}`, { action: 'request' })).ok()).toBe(true);
    await untilUnread(a, 1);
    await a.page.goto('/home');
    await expect(bellLink(a.page)).toHaveAccessibleName(/^Chimes\s*,\s*1 unread$/);
    await b.page.goto('/home'); // Bob never rings his own bell
    await expect(bellLink(b.page)).toHaveAccessibleName('Chimes');

    // She opens Chimes, sees it as unread, and following it goes to the Pals page and marks it read.
    await bellLink(a.page).click();
    await expect(a.page.getByRole('heading', { name: 'Chimes', level: 1 })).toBeVisible();
    const item = a.page.getByRole('link', { name: /wants to be your Pal/ });
    await expect(item).toContainText('Unread');
    await item.click();
    await expect(a.page).toHaveURL(/\/pals$/);
    await untilUnread(a, 0);
    await a.page.goto('/chimes');
    await expect(a.page.getByRole('status')).toHaveText('All caught up');
    await expect(bellLink(a.page)).toHaveAccessibleName('Chimes');

    // Alice accepts (Bob is told), Bob nails a card and gives a Yo; "Mark all read" clears the lot.
    expect((await api(a, `/api/relationships/${b.handle}`, { action: 'accept' })).ok()).toBe(true);
    await untilUnread(b, 1);
    const card = await api(b, `/api/ranch/${a.handle}/fence`, { body: 'Howdy from Bob' });
    expect(card.status()).toBe(201);
    const ownCard = await api(a, `/api/ranch/${a.handle}/fence`, { body: 'Alice card' });
    const cardId = ((await ownCard.json()) as { card: { id: string } }).card.id;
    expect((await api(b, `/api/cards/${cardId}/yo`, { on: true })).ok()).toBe(true);
    await untilUnread(a, 2);
    await a.page.goto('/chimes');
    await expect(a.page.getByText(`${b.handle} nailed a card to your Fence.`)).toBeVisible();
    await expect(a.page.getByText(`${b.handle} gave your card a Yo.`)).toBeVisible();
    await expect(a.page.getByRole('status')).toHaveText('2 unread');
    await a.page.getByRole('button', { name: 'Mark all read' }).click();
    await expect(a.page.getByRole('status')).toHaveText('All caught up');
    await a.page.reload();
    await expect(bellLink(a.page)).toHaveAccessibleName('Chimes');

    // Alice mutes Bob: what he rang earlier disappears from her Chimes, without a word to Bob.
    expect((await api(a, `/api/relationships/${b.handle}`, { action: 'mute' })).ok()).toBe(true);
    await a.page.reload();
    await expect(a.page.getByText('All quiet on the range')).toBeVisible();
    expect((await api(a, `/api/relationships/${b.handle}`, { action: 'unmute' })).ok()).toBe(true);

    // Chime settings: switching Yo off means a new Yo does not ring.
    await a.page.goto('/workshop');
    await a.page.getByRole('switch', { name: /^Yo When/ }).click();
    await expect(a.page.getByRole('status').filter({ hasText: 'Chime settings saved' })).toBeVisible();
    const second = await api(a, `/api/ranch/${a.handle}/fence`, { body: 'Second card' });
    const id2 = ((await second.json()) as { card: { id: string } }).card.id;
    expect((await api(b, `/api/cards/${id2}/yo`, { on: true })).ok()).toBe(true);
    await api(b, `/api/cards/${id2}/replies`, { body: 'a reply' }); // replies are still on
    await untilUnread(a, 1); // the earlier ones were marked read; only this reply is new — this Yo did not ring
    await a.page.goto('/chimes');
    await expect(a.page.getByText('scribbled a reply on your card')).toBeVisible();
    await expect(a.page.getByText(`${b.handle} gave your card a Yo.`)).toHaveCount(1); // only the earlier one

    expect(problems).toEqual([]);
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });

  test('a Restricted writer’s card rings the owner as "waiting" and approving it tells the writer nothing', async ({
    browser,
  }) => {
    const a = await person(browser, 'waitowner');
    const b = await person(browser, 'waitfriend');
    await makePosse(b, a);
    await api(a, '/api/me/ranch', { fencePosting: 'members' }, 'PATCH');
    await api(a, `/api/relationships/${b.handle}`, { action: 'restrict' });
    const posted = await api(b, `/api/ranch/${a.handle}/fence`, { body: 'Quiet words' });
    const id = ((await posted.json()) as { card: { id: string } }).card.id;
    await untilUnread(a, 2); // the accept-era Posse chime is Alice's? No: Bob asked, Alice accepted -> Bob rang; Alice got the ask + this
    await a.page.goto('/chimes');
    await expect(a.page.getByText(`A card from ${b.handle} is waiting for your approval.`)).toBeVisible();
    const before = ((await (await b.page.request.get('/api/me/chimes/unread')).json()) as { unread: number })
      .unread;
    expect((await api(a, `/api/cards/${id}/approve`, {})).ok()).toBe(true);
    await new Promise((r) => setTimeout(r, 1500));
    const after = ((await (await b.page.request.get('/api/me/chimes/unread')).json()) as { unread: number })
      .unread;
    expect(after).toBe(before); // approving a held card rings nothing for its writer
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});

test.describe('Chimes: accessibility and layout in a real browser', () => {
  async function seed(browser: Browser, opts: Parameters<typeof newContext>[1]) {
    const a = await person(browser, `ca${Date.now().toString(36).slice(-4)}`, opts);
    const b = await person(browser, `cb${Date.now().toString(36).slice(-4)}`, opts);
    await api(b, `/api/relationships/${a.handle}`, { action: 'request' });
    await api(a, `/api/relationships/${b.handle}`, { action: 'accept' });
    await api(a, '/api/me/ranch', { fencePosting: 'members' }, 'PATCH');
    await api(b, `/api/ranch/${a.handle}/fence`, { body: 'A card from a friend' });
    const own = await api(a, `/api/ranch/${a.handle}/fence`, { body: 'My own card' });
    const id = ((await own.json()) as { card: { id: string } }).card.id;
    await api(b, `/api/cards/${id}/yo`, { on: true });
    await api(b, `/api/cards/${id}/replies`, { body: 'A reply' });
    await untilUnread(a, 4);
    // One read, the rest unread, so both looks are on the page.
    const list = (await (await a.page.request.get('/api/me/chimes')).json()) as { chimes: { id: string }[] };
    await api(a, '/api/me/chimes/read', { ids: [list.chimes[list.chimes.length - 1]!.id] });
    return { a, b };
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations, including real colour contrast (${scheme})`, async ({ browser }) => {
      const { a, b } = await seed(browser, { colorScheme: scheme, bypassCSP: true, reducedMotion: 'reduce' });
      const source = axeSource();
      for (const path of ['/chimes', '/workshop', '/home']) {
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

  test('no horizontal scroll at 320px and every control is at least 44px on touch', async ({ browser }) => {
    const { a, b } = await seed(browser, {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 700 },
    });
    for (const path of ['/chimes', '/workshop', '/home']) {
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
              `${el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 28)}" ${Math.round(r.height)}px`,
            );
        }
        return out;
      });
      expect(small, `${path} small targets`).toEqual([]);
    }
    await Promise.all([a.ctx.close(), b.ctx.close()]);
  });
});
