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

/** ADR-029: "Pals you may know" on the Pals page, on a 320 px touch phone; Not now removes it for good. */

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

test('Pals you may know: shown with shared Pals, asked from the card, or dismissed for good', async ({
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

  await me.page.goto('/pals');
  await pageReady(me.page);
  const card = me.page.getByRole('region', { name: 'Pals you may know' });
  const row = card.getByRole('listitem').filter({ hasText: `Person ${x!.handle}` });
  await expect(row).toBeVisible();
  await expect(row.getByText(/^Pals with /)).toBeVisible();
  expect(await axeViolations(me.page)).toEqual([]);
  expect(await smallTargets(me.page)).toEqual([]);
  expect(await horizontalOverflow(me.page)).toBe(0);

  await row.getByRole('button', { name: /^Not now/ }).click();
  await expect(card).toHaveCount(0);
  await me.page.reload();
  await pageReady(me.page);
  await expect(me.page.getByRole('region', { name: 'Pals you may know' })).toHaveCount(0);
  expect(problems).toEqual([]);
  await me.ctx.close();
});
