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

/**
 * ADR-029 / ADR-061: "Friends you may know" on Friends and on Home, on a 320 px touch phone; Not now removes it for good.
 * Early days (under EARLY_DAYS_UNTIL active people) also suggest people with fewer shared friends, so this shared e2e
 * database may show others in the row: every check is about the people made here, never "the row is empty".
 * The early-days rules themselves are tested in tests/security/suggestions.test.ts.
 */

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

/** Make two people Pals directly in the database (the ask/accept journey has its own spec). */
const pals = (a: string, b: string) =>
  db.query(
    `insert into posse_links (user_low, user_high, status, requested_by, responded_at)
     select least(x.id, y.id), greatest(x.id, y.id), 'accepted', x.id, now()
     from users x, users y where x.handle = $1 and y.handle = $2`,
    [a, b],
  );

test('Friends you may know: shown with shared friends, asked from the card, or dismissed for good', async ({
  browser,
}) => {
  const me = await person(browser, 'sugme');
  const problems = await watchProblems(me.page);
  // Three extra people with ordinary accounts made straight in the database: two Pals of mine, and one of theirs.
  const [a, b, x] = ['suga', 'sugb', 'sugx'].map((t) => uniqueAccount(t));
  for (const p of [a!, b!, x!]) {
    await db.query(
      `with u as (insert into users (email, handle, email_verified_at, created_at)
         values ($1, $2, now(), now() - interval '30 days') returning id)
       insert into profiles (user_id, display_name) select id, $3 from u`,
      [p.email, p.handle, `Person ${p.handle}`],
    );
  }
  await pals(me.handle, a!.handle);
  await pals(me.handle, b!.handle);
  await pals(a!.handle, x!.handle);
  await pals(b!.handle, x!.handle);

  await me.page.goto('/friends');
  await pageReady(me.page);
  const card = me.page.getByRole('region', { name: 'Friends you may know' });
  const row = card.getByRole('listitem').filter({ hasText: `Person ${x!.handle}` });
  await expect(row).toBeVisible();
  await expect(row.getByText(/^Friends with /)).toBeVisible();
  expect(await axeViolations(me.page)).toEqual([]);
  expect(await smallTargets(me.page)).toEqual([]);
  expect(await horizontalOverflow(me.page)).toBe(0);

  await row.getByRole('button', { name: /^Not now/ }).click();
  await expect(row).toHaveCount(0);
  await me.page.reload();
  await pageReady(me.page);
  // Gone for good (the card itself may stay, with other people in it).
  await expect(me.page.getByText(`Person ${x!.handle}`)).toHaveCount(0);
  expect(problems).toEqual([]);
  await me.ctx.close();
});

test('Home: friends you may know as small cards before the posts; Ask, and the × that dismisses for good', async ({
  browser,
}) => {
  const me = await person(browser, 'hsugme');
  const problems = await watchProblems(me.page);
  const [a, b, x, y] = ['hsuga', 'hsugb', 'hsugx', 'hsugy'].map((t) => uniqueAccount(t));
  for (const p of [a!, b!, x!, y!]) {
    await db.query(
      `with u as (insert into users (email, handle, email_verified_at, created_at)
         values ($1, $2, now(), now() - interval '30 days') returning id)
       insert into profiles (user_id, display_name) select id, $3 from u`,
      [p.email, p.handle, `Person ${p.handle}`],
    );
  }
  await pals(me.handle, a!.handle);
  await pals(me.handle, b!.handle);
  for (const s of [x!, y!]) {
    await pals(a!.handle, s.handle);
    await pals(b!.handle, s.handle);
  }

  await me.page.goto('/home');
  await pageReady(me.page);
  const strip = me.page.getByRole('region', { name: 'Friends you may know' });
  await expect(strip.getByText('2 mutual friends')).toHaveCount(2);
  // It comes before the posts.
  const [stripTop, postsTop] = await Promise.all([
    strip.boundingBox().then((r) => r!.y),
    me.page
      .getByRole('heading', { level: 2, name: 'What’s Going On?' })
      .boundingBox()
      .then((r) => r!.y),
  ]);
  expect(stripTop).toBeLessThan(postsTop);
  expect(await axeViolations(me.page)).toEqual([]);
  expect(await smallTargets(me.page)).toEqual([]);
  expect(await horizontalOverflow(me.page)).toBe(0);

  const xCard = strip.getByRole('listitem').filter({ hasText: `Person ${x!.handle}` });
  await xCard.getByRole('button', { name: `Add Person ${x!.handle} as a friend` }).click();
  await expect(xCard.getByText('Request sent')).toBeVisible();

  const yCard = strip.getByRole('listitem').filter({ hasText: `Person ${y!.handle}` });
  await yCard.getByRole('button', { name: `Not now: stop suggesting Person ${y!.handle}` }).click();
  await expect(yCard).toHaveCount(0);
  await me.page.reload();
  await pageReady(me.page);
  // Asked and dismissed: neither is suggested again (the row may stay, with other people in it).
  await expect(me.page.getByText(`Person ${x!.handle}`)).toHaveCount(0);
  await expect(me.page.getByText(`Person ${y!.handle}`)).toHaveCount(0);
  expect(problems).toEqual([]);
  await me.ctx.close();
});
