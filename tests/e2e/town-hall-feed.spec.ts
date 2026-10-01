import { expect, test, type Browser, type Page } from '@playwright/test';
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

const ORIGIN = 'http://localhost:3300';

/** A signed-in person on a 320 px touch phone (every control must be a 44 px target). */
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
type Person = Awaited<ReturnType<typeof person>>;

const api = (p: Person, path: string, data: unknown) =>
  p.page.request.fetch(path, { method: 'POST', data, headers: { origin: ORIGIN } });

/** The Post Card-shaped post from this person (its accessible name says who wrote it). */
const postFrom = (page: Page, handle: string) => page.getByRole('article', { name: `Post from ${handle}` });

/** Reach the Town Hall the way a person would: Town Halls → Mine → Open. */
async function openByTapping(p: Person, name: string, id: string) {
  await p.page.goto('/town-halls');
  await pageReady(p.page);
  await p.page.getByRole('tab', { name: /^Mine/ }).tap();
  await p.page
    .getByRole('heading', { name, level: 2, exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " clay ")][1]')
    .getByRole('link')
    .first()
    .tap();
  await expect(p.page).toHaveURL(new RegExp(`/town-halls/${id}$`));
  await pageReady(p.page);
}

test.describe('Town Hall feed (production build, real CSP, phone)', () => {
  test('a member posts; another reacts and replies; the writer is Chimed; outsiders see no feed', async ({
    browser,
  }) => {
    const owner = await person(browser, 'feedowner');
    const ann = await person(browser, 'feedann');
    const outsider = await person(browser, 'feedout');
    const problems = await watchProblems(ann.page);

    const name = `Porch Talk ${Date.now().toString(36)}`;
    const made = await api(owner, '/api/town-halls', {
      name,
      description: 'Chatting on the porch.',
      visibility: 'open',
    });
    expect(made.status()).toBe(201);
    const id = ((await made.json()) as { townHall: { id: string } }).townHall.id;
    expect((await api(ann, `/api/town-halls/${id}`, { action: 'join' })).status()).toBe(200);

    // Ann posts from the Town Hall's page.
    await openByTapping(ann, name, id);
    await expect(ann.page.getByRole('heading', { name: 'The feed' })).toBeVisible();
    await ann.page.getByLabel('Post to this Town Hall').fill('Who is up for chai on Sunday?');
    await ann.page.getByRole('button', { name: 'Post', exact: true }).tap();
    await expect(postFrom(ann.page, ann.handle)).toContainText('Who is up for chai on Sunday?');

    // The owner sees it, gives it a Yo and scribbles a reply on its back.
    await openByTapping(owner, name, id);
    const theirPost = postFrom(owner.page, ann.handle);
    await expect(theirPost).toContainText('Who is up for chai on Sunday?');
    await theirPost.getByRole('button', { name: 'Yo', exact: true }).tap();
    await expect(theirPost.getByRole('button', { name: 'Yo', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await theirPost.getByRole('button', { name: /Flip/ }).tap();
    await owner.page.getByLabel('Scribble a reply').fill('Count me in!');
    await owner.page.getByRole('button', { name: 'Scribble', exact: true }).tap();
    await expect(owner.page.getByText('Count me in!')).toBeVisible();

    // Ann's bell has both, and they lead back to the Town Hall.
    await ann.page.goto('/chimes');
    await pageReady(ann.page);
    await expect(ann.page.getByText(`${owner.handle} replied to your post in a Town Hall.`)).toBeVisible();
    await expect(ann.page.getByText(`${owner.handle} reacted to your post in a Town Hall.`)).toBeVisible();
    await ann.page.getByText(`${owner.handle} replied to your post in a Town Hall.`).tap();
    await expect(ann.page).toHaveURL(new RegExp(`/town-halls/${id}$`));
    await pageReady(ann.page);
    await expect(postFrom(ann.page, ann.handle)).toBeVisible();

    // Checks on the member's view of the page, at 320 px.
    expect(await axeViolations(ann.page)).toEqual([]);
    expect(await smallTargets(ann.page)).toEqual([]);
    expect(await horizontalOverflow(ann.page)).toBe(0);

    // Someone who has not joined sees the Town Hall but no feed, and the feed's address answers 404.
    await outsider.page.goto(`/town-halls/${id}`);
    await pageReady(outsider.page);
    await expect(outsider.page.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(outsider.page.getByRole('heading', { name: 'The feed' })).toHaveCount(0);
    await expect(outsider.page.getByText('Who is up for chai on Sunday?')).toHaveCount(0);
    expect((await outsider.page.request.get(`/api/town-halls/${id}/posts`)).status()).toBe(404);

    // Ann takes her post back.
    await ann.page.getByRole('button', { name: `More about this post from @${ann.handle}` }).tap();
    await ann.page.getByRole('menuitem', { name: 'Take it back' }).tap();
    await ann.page.getByRole('button', { name: 'Take it down' }).tap();
    await expect(postFrom(ann.page, ann.handle)).toHaveCount(0);

    expect(problems).toEqual([]);
    await Promise.all([owner.ctx.close(), ann.ctx.close(), outsider.ctx.close()]);
  });
});
