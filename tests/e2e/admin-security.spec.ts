import { expect, test, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Pool } from 'pg';
import {
  axeViolations,
  confirmEmailVia,
  horizontalOverflow,
  makeStaff,
  newContext,
  pageReady,
  settleAccount,
  signUpVia,
  smallTargets,
  stepInsideVia,
  uniqueAccount,
} from './helpers';

/** The Security Center (Control Room): admin-only, read-only, reflects the audit trail. */

const db = new Pool({ connectionString: parse(readFileSync('.env.local')).E2E_DATABASE_URL, max: 1 });
test.afterAll(async () => {
  await db.end();
});

async function person(browser: Browser, tag: string, viewport = { width: 1280, height: 900 }) {
  const account = uniqueAccount(tag);
  const ctx = await newContext(browser, { viewport });
  const page = await ctx.newPage();
  await signUpVia(page, account);
  await settleAccount(account.handle);
  await confirmEmailVia(page, account.email);
  await stepInsideVia(page, account.email, account.password);
  await expect(page).toHaveURL(/\/home$/);
  return { ...account, ctx, page };
}

const logEvent = (handle: string, event: string, minsAgo: number) =>
  db.query(
    `insert into audit_log (user_id, event, created_at)
     select id, $2, now() - ($3 || ' minutes')::interval from users where handle = $1`,
    [handle, event, String(minsAgo)],
  );

test('an admin sees the Security Center; a non-admin gets a plain 404', async ({ browser }) => {
  test.slow();
  const admin = await person(browser, 'adm');
  const target = await person(browser, 'tgt');

  // Promote AFTER sign-in (role is read live); seed a few events so the panels have something to show.
  await makeStaff(db, admin.handle, 'admin');
  for (let i = 1; i <= 6; i++) await logEvent(target.handle, 'login_failed', i);
  await logEvent(target.handle, 'two_step_off', 8);
  await logEvent(admin.handle, 'password_reset_completed', 15);

  // A non-admin: the Control Room is not advertised — same 404 as a page that does not exist.
  const resp = await target.page.goto('/admin/security');
  expect(resp?.status()).toBe(404);

  // The admin sees it.
  await admin.page.goto('/admin/security');
  await pageReady(admin.page);
  await expect(admin.page.getByRole('heading', { name: /Mission Console/ })).toBeVisible();
  // The seeded account shows up under sign-in pressure (6 >= the flag threshold of 5).
  await expect(admin.page.getByText(target.handle, { exact: false }).first()).toBeVisible();
  await expect(admin.page.getByText(/login/).first()).toBeVisible();
  // A sensitive change is listed, and the system panel reports health.
  await expect(admin.page.getByText(/Two step off|Password reset completed/).first()).toBeVisible();
  await expect(admin.page.getByText('Database').first()).toBeVisible();

  // A full-HD control-room screen: everything fits, the page itself never scrolls (lists scroll in their panels).
  await admin.page.setViewportSize({ width: 1920, height: 1080 });
  await admin.page.reload();
  await pageReady(admin.page);
  const pageHeight = await admin.page.evaluate(() => document.documentElement.scrollHeight);
  expect(pageHeight).toBeLessThanOrEqual(1080);
  // Dense dashboard type: no text anywhere on the page is larger than 14px.
  const tooBig = await admin.page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) > 14)
      .map((el) => `${getComputedStyle(el).fontSize} <${el.tagName.toLowerCase()} class="${el.className}">`),
  );
  expect(tooBig).toEqual([]);
  // Dark charcoal with ghost-white text (a stylesheet class: the CSP would block an inline style).
  const colours = await admin.page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.control-room')!);
    return [cs.backgroundColor, cs.color];
  });
  expect(colours).toEqual(['rgb(27, 28, 31)', 'rgb(248, 248, 255)']);
  await admin.page.screenshot({ path: '.dev/admin-security.png' });
  expect(await axeViolations(admin.page)).toEqual([]);
  expect(await smallTargets(admin.page)).toEqual([]);
  expect(await horizontalOverflow(admin.page)).toBe(0);

  // The range tabs re-read the same console for another window.
  await admin.page.getByRole('link', { name: '7d', exact: true }).click();
  await expect(admin.page).toHaveURL(/range=7d/);
  await expect(admin.page.getByText(/last 7 days/).first()).toBeVisible();

  // And it stays readable on a phone.
  await admin.page.setViewportSize({ width: 320, height: 720 });
  await admin.page.reload();
  await pageReady(admin.page);
  expect(await horizontalOverflow(admin.page)).toBe(0);
  await admin.page.screenshot({ path: '.dev/admin-security-phone.png', fullPage: true });

  for (const p of [admin, target]) await p.ctx.close();
});
