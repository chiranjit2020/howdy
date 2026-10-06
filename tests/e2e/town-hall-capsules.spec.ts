import { readFileSync } from 'node:fs';
import { expect, test, type Browser } from '@playwright/test';
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
} from './helpers';

/** ADR-043: the owner seals a Time Capsule for a Town Hall from a phone; a member sees it coming, then as a post. */

const PHONE = { hasTouch: true, isMobile: true, viewport: { width: 320, height: 720 } };

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

test.describe('Town Hall Time Capsules (production build, real CSP)', () => {
  test('sealed from a phone, seen coming by a member, opened as a stamped post on its day', async ({
    browser,
  }) => {
    test.slow(); // several people signing up on phones: past the default limit on a busy machine
    const owner = await person(browser, 'tcowner', PHONE);
    const ann = await person(browser, 'tcann', PHONE);
    const problems = await watchProblems(owner.page);
    const name = `Capsule Porch ${Date.now().toString(36)}`;
    const words = `Howdy from the past ${Date.now().toString(36)}`;

    await owner.page.goto('/town-halls');
    await pageReady(owner.page);
    await owner.page.getByRole('button', { name: 'Start a Town Hall' }).click();
    await owner.page.getByLabel('Name').fill(name);
    await owner.page.getByLabel('What is it about?').fill('Letters to later.');
    await owner.page.getByRole('button', { name: 'Start it' }).click();
    await owner.page.getByRole('tab', { name: /^Mine/ }).click();
    const url = (await owner.page
      .getByRole('link', { name: /^Manage/ })
      .first()
      .getAttribute('href'))!;
    const id = url.split('/').pop()!;

    await ann.page.goto(url);
    await pageReady(ann.page);
    await ann.page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(ann.page.getByRole('button', { name: 'Leave' })).toBeVisible();

    // The owner seals one for next week.
    await owner.page.goto(url);
    await pageReady(owner.page);
    await expect(owner.page.getByRole('heading', { name: 'Time Capsules' })).toBeVisible();
    const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await owner.page.getByLabel('Opens on').fill(inAWeek);
    await owner.page.getByLabel('Your words').fill(words);
    await owner.page.getByRole('button', { name: 'Seal it' }).click();
    await expect(owner.page.getByRole('button', { name: 'Take back' })).toBeVisible();
    // One card, one form (a remount once left a stale copy behind).
    await expect(owner.page.getByRole('heading', { name: 'Time Capsules' })).toHaveCount(1);
    await expect(owner.page.getByText(words)).toHaveCount(0);
    await expect(owner.page.getByLabel('Your words')).toHaveValue('');
    expect(await axeViolations(owner.page)).toEqual([]);
    expect(await smallTargets(owner.page)).toEqual([]);
    expect(await horizontalOverflow(owner.page)).toBe(0);

    // A member sees who and when — not the words, and no form or Take back.
    await ann.page.reload();
    await pageReady(ann.page);
    await expect(ann.page.getByText(/^From /).first()).toBeVisible();
    await expect(ann.page.getByText(words)).toHaveCount(0);
    await expect(ann.page.getByRole('button', { name: 'Seal it' })).toHaveCount(0);
    await expect(ann.page.getByRole('button', { name: 'Take back' })).toHaveCount(0);

    // Its day comes.
    const db = new Pool({ connectionString: parse(readFileSync('.env.local')).E2E_DATABASE_URL, max: 1 });
    try {
      await db.query(
        `update town_hall_capsules set open_on = (now() at time zone 'Asia/Kolkata')::date where town_hall_id = $1`,
        [id],
      );
    } finally {
      await db.end();
    }
    await ann.page.reload();
    await pageReady(ann.page);
    await expect(ann.page.getByText(words)).toBeVisible();
    await expect(ann.page.getByText('Time Capsule', { exact: true })).toBeVisible();
    await expect(ann.page.getByText(/^Sealed on /)).toBeVisible();
    // Nothing left coming, so a member no longer sees the card.
    await expect(ann.page.getByRole('heading', { name: 'Time Capsules' })).toHaveCount(0);
    expect(await axeViolations(ann.page)).toEqual([]);
    expect(await horizontalOverflow(ann.page)).toBe(0);
    expect(problems).toEqual([]);
    for (const p of [owner, ann]) await p.ctx.close();
  });
});
