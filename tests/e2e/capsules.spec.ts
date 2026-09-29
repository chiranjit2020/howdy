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
} from './helpers';

/** ADR-028: seal a Time Capsule, see it open on its day; a memory on Home. On a 320 px touch phone. */

const db = new Pool({ connectionString: parse(readFileSync('.env.local')).E2E_DATABASE_URL, max: 1 });
test.afterAll(async () => {
  await db.end();
});

async function person(browser: Browser, tag: string) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser, {
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 720 },
  });
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await settleAccount(account.handle);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}

test.describe('Time Capsules and Memories (production build, real CSP)', () => {
  test('seal one for my future self; the words stay hidden until its day, then it opens', async ({
    browser,
  }) => {
    const me = await person(browser, 'capsule');
    const problems = await watchProblems(me.page);
    const words = `Dear future me (${me.handle})`;

    await me.page.goto('/capsules');
    await pageReady(me.page);
    const tomorrow = await me.page.getByLabel('Opens on').getAttribute('min');
    await me.page.getByLabel('Opens on').fill(tomorrow!);
    await me.page.getByLabel('Your words').fill(words);
    await me.page.getByRole('button', { name: 'Seal it' }).click();
    await expect(me.page.getByText(/^Sealed\. It opens on/)).toBeVisible();
    await expect(me.page.getByRole('region', { name: 'Sealed by you' })).toBeVisible();
    // Take-back also updates both lists at once (a capsule to myself is in both).
    const tomorrowLater = await me.page.getByLabel('Opens on').getAttribute('max');
    await me.page.getByLabel('Opens on').fill(tomorrowLater!);
    await me.page.getByLabel('Your words').fill('to take back');
    await me.page.getByRole('button', { name: 'Seal it' }).click();
    await expect(me.page.getByRole('region', { name: 'Sealed by you' }).getByRole('listitem')).toHaveCount(2);
    await me.page
      .getByRole('region', { name: 'Sealed by you' })
      .getByRole('button', { name: 'Take back' })
      .last()
      .click();
    await me.page.getByRole('button', { name: 'Take it back' }).click();
    await expect(me.page.getByRole('region', { name: 'Sealed by you' }).getByRole('listitem')).toHaveCount(1);
    await expect(me.page.getByRole('region', { name: 'Coming to you' }).getByRole('listitem')).toHaveCount(1);
    // Sealed means sealed, for me too: the words are nowhere on the page.
    await me.page.reload();
    await pageReady(me.page);
    await expect(me.page.getByText(words)).toHaveCount(0);
    expect(await axeViolations(me.page)).toEqual([]);
    expect(await smallTargets(me.page)).toEqual([]);
    expect(await horizontalOverflow(me.page)).toBe(0);

    // Its day comes.
    await db.query(
      "update time_capsules set open_on = (now() at time zone 'Asia/Kolkata')::date where author_id = (select id from users where handle = $1)",
      [me.handle],
    );
    await me.page.reload();
    await pageReady(me.page);
    const opened = me.page.getByRole('region', { name: 'Opened' });
    await expect(opened.getByText(words)).toBeVisible();
    await expect(opened.getByText(/From your past self/)).toBeVisible();

    expect(problems).toEqual([]);
    await me.ctx.close();
  });

  test('Home shows "On this day" for a card nailed a year ago today', async ({ browser }) => {
    const me = await person(browser, 'memory');
    const words = `A year ago (${me.handle})`;
    await db.query(
      `insert into post_cards (fence_owner_id, author_id, body, status, created_at)
       select id, id, $2, 'published', now() - interval '1 year' from users where handle = $1`,
      [me.handle, words],
    );
    await me.page.goto('/home');
    await pageReady(me.page);
    const memories = me.page.getByRole('region', { name: 'On this day' });
    await expect(memories.getByText(words)).toBeVisible();
    expect(await axeViolations(me.page)).toEqual([]);
    expect(await horizontalOverflow(me.page)).toBe(0);
    await me.ctx.close();
  });
});
