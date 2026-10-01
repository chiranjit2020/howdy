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

/** ADR-032: switch on a Porch Light on Home; a Pal sees it on Home and on the Porch; switching off clears it. 320 px phones. */

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

/** Make two people Pals directly (the Pals flow has its own spec). */
const makePals = (a: string, b: string) =>
  db.query(
    `insert into posse_links (user_low, user_high, status, requested_by, responded_at)
     select least(x.id, y.id), greatest(x.id, y.id), 'accepted', x.id, now()
     from users x, users y where x.handle = $1 and y.handle = $2`,
    [a, b],
  );

test.describe('Porch Light (production build, real CSP)', () => {
  test('switch it on with a note; a Pal sees it on Home and on the Porch; switching off clears it', async ({
    browser,
  }) => {
    const [owner, pal] = [await person(browser, 'lamp'), await person(browser, 'moth')];
    await makePals(owner.handle, pal.handle);
    const problems = await watchProblems(owner.page);
    const palProblems = await watchProblems(pal.page);
    const note = `free for chai ${owner.handle.slice(-4)}`;

    // The owner switches it on from Home.
    await owner.page.goto('/home');
    await pageReady(owner.page);
    const card = owner.page.getByRole('region', { name: 'Porch Lights' });
    await card.getByRole('button', { name: 'Switch on your Porch Light' }).tap();
    await card.getByLabel('2 hours').check();
    await expect(card.getByLabel('All Pals')).toBeChecked();
    await card.getByLabel('Note (optional)').fill(note);
    expect(await axeViolations(owner.page)).toEqual([]);
    expect(await smallTargets(owner.page)).toEqual([]);
    expect(await horizontalOverflow(owner.page)).toBe(0);
    await card.getByRole('button', { name: 'Switch on', exact: true }).tap();
    await expect(
      card.getByText(/Your light is on until \d{1,2}:\d{2} [ap]m, for all your Pals\./),
    ).toBeVisible();
    await expect(card.getByText(note)).toBeVisible();

    // The Pal sees it on Home, with a Whisper button.
    await pal.page.goto('/home');
    await pageReady(pal.page);
    const lit = pal.page.getByRole('list', { name: 'Pals free to talk' });
    await expect(lit.getByRole('link', { name: owner.handle, exact: true })).toBeVisible();
    await expect(lit.getByText(/is free until \d{1,2}:\d{2} [ap]m/)).toBeVisible();
    await expect(lit.getByText(note)).toBeVisible();
    expect(await axeViolations(pal.page)).toEqual([]);
    expect(await smallTargets(pal.page)).toEqual([]);
    expect(await horizontalOverflow(pal.page)).toBe(0);
    await lit.getByRole('link', { name: `Whisper to ${owner.handle}` }).tap();
    await expect(pal.page).toHaveURL(new RegExp(`/whispers/${owner.handle}$`));

    // ...and on the owner's Porch.
    await pal.page.goto(`/porch/${owner.handle}`);
    await pageReady(pal.page);
    await expect(pal.page.getByRole('heading', { name: 'Porch Light on' })).toBeVisible();
    await expect(pal.page.getByText(new RegExp(`is free to talk until`))).toBeVisible();
    expect(await horizontalOverflow(pal.page)).toBe(0);

    // The owner switches it off; it is gone for the Pal.
    await owner.page.getByRole('button', { name: 'Switch off' }).tap();
    await expect(card.getByRole('button', { name: 'Switch on your Porch Light' })).toBeVisible();
    await pal.page.goto('/home');
    await pageReady(pal.page);
    await expect(pal.page.getByText('No Pal has their light on right now.')).toBeVisible();
    expect(
      (
        await db.query(
          'select count(*)::int n from porch_lights p join users u on u.id = p.user_id where u.handle = $1',
          [owner.handle],
        )
      ).rows[0].n,
    ).toBe(0);

    expect(problems).toEqual([]);
    expect(palProblems).toEqual([]);
    await owner.ctx.close();
    await pal.ctx.close();
  });
});
