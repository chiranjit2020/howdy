import { randomInt } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';

const OUTBOX = join(process.cwd(), '.dev', 'e2e-outbox');

/** A fresh browser context with its own client address, so rate limits never carry over between tests or runs. */
export function newContext(
  browser: Browser,
  opts: Parameters<Browser['newContext']>[0] = {},
): Promise<BrowserContext> {
  const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  return browser.newContext({
    ...opts,
    extraHTTPHeaders: { 'x-forwarded-for': ip, ...(opts?.extraHTTPHeaders ?? {}) },
  });
}

export const uniqueAccount = (tag: string) => {
  const n = `${Date.now().toString(36)}${randomInt(1000, 9999)}`;
  return {
    handle: `${tag}_${n}`.slice(0, 24),
    email: `${tag}.${n}@example.com`,
    password: 'correct horse battery staple',
  };
};

/** Wait for the newest mail to `to` in the file outbox and return its text. Mail is sent after the response. */
export async function waitForMail(
  to: string,
  timeoutMs = 10_000,
): Promise<{ subject: string; text: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(OUTBOX)) {
      const files = readdirSync(OUTBOX).sort().reverse();
      for (const f of files) {
        const msg = JSON.parse(readFileSync(join(OUTBOX, f), 'utf8')) as {
          to: string;
          subject: string;
          text: string;
        };
        if (msg.to === to) return msg;
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`no mail for ${to} within ${timeoutMs}ms`);
}

export const linkFrom = (text: string): string => {
  const m = /(https?:\/\/[^\s]+token=[A-Za-z0-9_-]{43})/.exec(text);
  if (!m) throw new Error('no token link in mail');
  return m[1]!;
};

/** Rewrite an emailed link (built from APP_URL) onto the page's origin path so the browser can open it. */
export const pathOf = (link: string): string => {
  const u = new URL(link);
  return `${u.pathname}${u.search}`;
};

export async function signUpVia(page: Page, a: { handle: string; email: string; password: string }) {
  await page.goto('/stake-a-claim');
  await page.getByLabel('Call sign').fill(a.handle);
  await page.getByLabel('Email').fill(a.email);
  await page.getByLabel('Secret Knock').fill(a.password);
  await page.getByRole('button', { name: 'Stake your claim' }).click();
  await page.getByRole('heading', { name: 'Check your email' }).waitFor();
}

export async function confirmEmailVia(page: Page, email: string) {
  const mail = await waitForMail(email);
  await page.goto(pathOf(linkFrom(mail.text)));
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  await page.getByRole('heading', { name: 'Deed granted!' }).waitFor();
}

export async function stepInsideVia(page: Page, identifier: string, password: string) {
  await page.goto('/step-inside');
  await page.getByLabel('Email or call sign').fill(identifier);
  await page.getByLabel('Secret Knock').fill(password);
  await page.getByRole('button', { name: 'Step Inside' }).click();
}

/**
 * Collect anything that should never happen in a healthy page: CSP violations, uncaught exceptions, console errors
 * and 5xx responses. Expected 4xx responses (wrong password, etc.) are deliberately NOT problems.
 */
export async function watchProblems(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
      problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => r.status() >= 500 && problems.push(`http ${r.status()}: ${r.url()}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      // Runs in the browser: surface it through the console so the listener above records it. (Not app code.)
      // eslint-disable-next-line no-console
      console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`),
    );
  });
  return problems;
}

export const axeSource = (): string =>
  readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
