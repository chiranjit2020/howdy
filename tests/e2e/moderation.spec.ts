import { expect, test, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Pool } from 'pg';
import {
  axeViolations,
  confirmEmailVia,
  horizontalOverflow,
  newContext,
  pageReady,
  settleAccount,
  signUpVia,
  smallTargets,
  stepInsideVia,
  uniqueAccount,
  watchProblems,
  makeStaff,
} from './helpers';

/** ADR-023: a suspended person is told why at sign-in and can appeal; a moderator answers on /moderation. */

const ORIGIN = 'http://localhost:3300';
const db = new Pool({ connectionString: parse(readFileSync('.env.local')).E2E_DATABASE_URL, max: 1 });
test.afterAll(async () => {
  await db.end();
});

async function person(browser: Browser, tag: string, opts: Parameters<typeof newContext>[1] = {}) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser, opts);
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await settleAccount(account.handle);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}

test.describe('Suspensions and appeals (production build, real CSP)', () => {
  test('told why at sign-in, appeals once, a moderator lifts it, and they are back in', async ({
    browser,
  }) => {
    const mod = await person(browser, 'mod');
    await makeStaff(db, mod.handle);
    // On a phone (touch), where every control must be a 44 px target; `sm` buttons shrink only for a mouse.
    const member = await person(browser, 'member', {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 800 },
    });
    const problems = await watchProblems(member.page);

    const suspended = await mod.page.request.fetch(`/api/moderation/accounts/${member.handle}`, {
      method: 'POST',
      data: { action: 'suspend', length: '7d', reason: 'spam' },
      headers: { origin: ORIGIN },
    });
    expect(suspended.status()).toBe(200);

    // Their session ended; signing in again tells them why, and for how long.
    await stepInsideVia(member.page, member.email, member.password);
    const notice = member.page.getByRole('region', { name: 'Your account is suspended' });
    await expect(notice).toBeVisible();
    await expect(notice.getByText('Spam', { exact: true })).toBeVisible();
    await expect(member.page).toHaveURL(/\/step-inside$/);
    expect(await axeViolations(member.page)).toEqual([]);
    expect(await smallTargets(member.page)).toEqual([]);

    // The e2e database is shared across runs: this run's appeal must be told apart from any left by an earlier one.
    const words = `That was my cousin on my phone, sorry. (${member.handle})`;
    await member.page.getByLabel('Appeal (you can send one)').fill(words);
    await member.page.getByRole('button', { name: 'Send appeal' }).click();
    await expect(member.page.getByText('Your appeal has been sent.')).toBeVisible();

    // The moderator sees it on /moderation and lifts the suspension.
    await mod.page.goto('/moderation');
    await pageReady(mod.page);
    const appeals = mod.page.getByRole('region', { name: 'Appeals' });
    const mine = appeals.getByRole('listitem').filter({ hasText: words });
    await expect(mine).toBeVisible();
    expect(await axeViolations(mod.page)).toEqual([]);
    await mine.getByRole('button', { name: 'Lift suspension' }).click();
    await expect(mine).toHaveCount(0);

    await stepInsideVia(member.page, member.email, member.password);
    await expect(member.page).toHaveURL(/\/home$/);
    expect(problems).toEqual([]);
    await Promise.all([mod.ctx.close(), member.ctx.close()]);
  });

  test('the held tray: a restricted Pal’s Whisper waits there, not in the thread, and can be flagged (ADR-026)', async ({
    browser,
  }) => {
    const phone = { hasTouch: true, isMobile: true, viewport: { width: 320, height: 700 } };
    const me = await person(browser, 'tray', phone);
    const them = await person(browser, 'pest');
    const problems = await watchProblems(me.page);
    const post = (p: typeof me, path: string, data: unknown) =>
      p.page.request.fetch(path, { method: 'POST', data, headers: { origin: ORIGIN } });
    expect((await post(them, `/api/relationships/${me.handle}`, { action: 'request' })).ok()).toBe(true);
    expect((await post(me, `/api/relationships/${them.handle}`, { action: 'accept' })).ok()).toBe(true);
    expect((await post(me, `/api/relationships/${them.handle}`, { action: 'restrict' })).ok()).toBe(true);
    const words = `held back for ${me.handle}`;
    expect(
      (await post(them, `/api/whispers/${me.handle}`, { clientId: crypto.randomUUID(), body: words })).ok(),
    ).toBe(true);

    await me.page.goto('/whispers');
    await pageReady(me.page);
    await me.page.getByRole('link', { name: /Held back from people you restricted \(1\)/ }).click();
    await expect(me.page).toHaveURL(/\/whispers\/held$/);
    const held = me.page.getByRole('list', { name: 'Held Whispers' }).getByRole('listitem');
    await expect(held).toHaveCount(1);
    await expect(held.getByText(words)).toBeVisible();
    expect(await axeViolations(me.page)).toEqual([]);
    expect(await smallTargets(me.page)).toEqual([]);
    expect(await horizontalOverflow(me.page)).toBe(0);

    await held.getByRole('button', { name: 'Flag this Whisper' }).click();
    await me.page.getByRole('button', { name: 'Send report' }).click();
    await expect(me.page.getByText('Thanks. We will take a look.')).toBeVisible();
    expect(problems).toEqual([]);
    await Promise.all([me.ctx.close(), them.ctx.close()]);
  });

  test('/moderation is a plain 404 for members; on a 320 px phone it fits and every control is 44 px', async ({
    browser,
  }) => {
    const member = await person(browser, 'plain');
    expect((await member.page.goto('/moderation'))?.status()).toBe(404);
    const mod = await person(browser, 'phonemod', {
      viewport: { width: 320, height: 640 },
      isMobile: true,
      hasTouch: true,
    });
    await makeStaff(db, mod.handle);
    expect((await mod.page.goto('/moderation'))?.status()).toBe(200);
    await pageReady(mod.page);
    expect(await horizontalOverflow(mod.page)).toBe(0);
    expect(await smallTargets(mod.page)).toEqual([]);
    await Promise.all([member.ctx.close(), mod.ctx.close()]);
  });
});
