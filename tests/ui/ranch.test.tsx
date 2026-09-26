// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PORTRAIT_TINTS } from '@/shared/validation/profile';
import { RanchHeader } from '@/ui/howdy';
import { Avatar } from '@/ui/primitives';
import { AppShell } from '@/ui/shell/app-shell';
import { axeViolations } from './setup';

// The navigation marks the current page from the URL; there is no router in a unit test.
vi.mock('next/navigation', () => ({ usePathname: () => '/workshop' }));

const XSS = '<img src=x onerror=alert(1)><script>alert(2)</script>';

describe('Ranch rendering treats user text as text', () => {
  it('a hostile display name, handle-like text and Signal are never interpreted as markup', () => {
    const { container } = render(
      <RanchHeader displayName={XSS} handle="mallory" signal={XSS} portraitTint="mint" />,
    );
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getAllByText(XSS, { exact: false }).length).toBeGreaterThanOrEqual(1);
    // The payload may appear inside an attribute value (e.g. aria-label) — that is inert text. What must never exist
    // is an element or event-handler attribute created from it.
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
  });

  it('has exactly one h1 (the display name) and no accessibility violations', async () => {
    const { container } = render(
      <main>
        <RanchHeader
          displayName="Priya Sharma"
          handle="priya"
          signal="Writing code"
          signalExpiresLabel="11h left"
          portraitTint="lavender"
          relationship="POSSE"
        />
      </main>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Avatar portrait tint', () => {
  it('uses the chosen tint, with dark on-colour text, for every option', () => {
    const fills = new Set<string>();
    for (const tint of PORTRAIT_TINTS) {
      const { container, unmount } = render(<Avatar name="Sneha Roy" tint={tint} />);
      const disc = container.querySelector('span > span') as HTMLElement;
      fills.add(
        disc.className
          .split(' ')
          .filter((c) => /^(bg|text)-(accent|success|warning|mystery|info|on-)/.test(c))
          .join(' '),
      );
      expect(disc.className).toMatch(/text-on-/);
      unmount();
    }
    expect(fills.size).toBe(PORTRAIT_TINTS.length); // five different looks
  });

  it('without a tint, the colour is derived from the name (stable per name)', () => {
    const a = render(<Avatar name="Rahul Das" />).container.innerHTML;
    const b = render(<Avatar name="Rahul Das" />).container.innerHTML;
    expect(a).toBe(b);
  });

  it('initials never cut an emoji in half', () => {
    render(<Avatar name={`${String.fromCodePoint(0x1f984)} Zainab`} />);
    expect(screen.getByRole('img').textContent).toBe(`${String.fromCodePoint(0x1f984)}Z`);
  });
});

describe('AppShell', () => {
  it('signed in: Home / My Porch / Pals / Workshop with the current page marked, and unread counts as text', () => {
    render(
      <AppShell me={{ handle: 'chiru', displayName: 'Chiru' }} unread={3} unreadWhispers={2}>
        <main>page</main>
      </AppShell>,
    );
    // Both forms of the navigation exist in the DOM (CSS decides which one shows); the sidebar comes first.
    const navs = screen.getAllByRole('navigation', { name: 'Primary' });
    expect(navs).toHaveLength(2);
    const nav = within(navs[0]!);
    expect(nav.getByRole('link', { name: 'My Porch' })).toHaveAttribute('href', '/porch/chiru');
    expect(nav.getByRole('link', { name: 'Pals' })).toHaveAttribute('href', '/pals');
    expect(nav.getByRole('link', { name: 'Workshop' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    // The count is text (not only a coloured pill), and the link still starts with its label.
    expect(nav.getByRole('link', { name: /^Chimes/ })).toHaveTextContent(/3\s*unread/);
    expect(nav.getByRole('link', { name: /^Whispers/ })).toHaveTextContent(/2\s*unread/);
    // The top bar: a bell that says how many are unread, and the way to your own Ranch.
    expect(screen.getByRole('link', { name: 'Notifications, 3 unread' })).toHaveAttribute('href', '/chimes');
    expect(screen.getByRole('link', { name: 'Your Porch' })).toHaveAttribute('href', '/porch/chiru');
  });
  it('signed out: only a way in, and no handle-based links', () => {
    render(
      <AppShell>
        <main>page</main>
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: /^Step Inside/ })).toHaveAttribute('href', '/step-inside');
    expect(screen.getByRole('link', { name: /^Stake a Claim/ })).toHaveAttribute('href', '/stake-a-claim');
    expect(screen.queryByRole('link', { name: 'My Porch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  });
  it('signed out on the sign-in pages: just the logo (the page itself is the way in)', () => {
    render(
      <AppShell waysIn={false}>
        <main>page</main>
      </AppShell>,
    );
    const bar = screen.getByRole('banner');
    expect(within(bar).getAllByRole('link')).toHaveLength(1);
    expect(within(bar).getByRole('link', { name: 'Howdy' })).toHaveAttribute('href', '/gate');
    expect(screen.queryByRole('link', { name: /^Step Inside/ })).not.toBeInTheDocument();
  });
});
