// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DetailsCard } from '@/app/profile/[handle]/details-card';
import { PORTRAIT_TINTS } from '@/shared/validation/profile';
import { RanchHeader } from '@/ui/howdy';
import { Avatar } from '@/ui/primitives';
import { AppShell } from '@/ui/shell/app-shell';
import { axeViolations } from './setup';

// The navigation marks the current page from the URL; there is no router in a unit test.
vi.mock('next/navigation', () => ({ usePathname: () => '/settings', useRouter: () => ({ push: () => {} }) }));

const XSS = '<img src=x onerror=alert(1)><script>alert(2)</script>';

describe('profile header extras', () => {
  it('the friend count shows only when given (your own profile), and links to the friends list', () => {
    const { rerender } = render(<RanchHeader displayName="Asha" handle="asha" friendCount={1} />);
    expect(screen.getByRole('link', { name: '1 friend' })).toHaveAttribute('href', '/friends');
    rerender(<RanchHeader displayName="Asha" handle="asha" friendCount={24} />);
    expect(screen.getByRole('link', { name: '24 friends' })).toBeInTheDocument();
    rerender(<RanchHeader displayName="Asha" handle="asha" />);
    expect(screen.queryByRole('link', { name: /friends?$/ })).not.toBeInTheDocument();
  });

  it('the Details card says what the tick means, team first; no tick and nothing to show, no card', () => {
    const { rerender, container } = render(<DetailsCard verified trusted lines={[]} />);
    expect(screen.getByText('Howdy team')).toBeInTheDocument();
    expect(screen.queryByText('Trusted member')).not.toBeInTheDocument();
    rerender(<DetailsCard verified={false} trusted lines={[]} />);
    expect(screen.getByText('Trusted member')).toBeInTheDocument();
    rerender(<DetailsCard verified={false} trusted={false} lines={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('details show as label and value; only the owner’s lines say who sees them', () => {
    const { rerender } = render(
      <DetailsCard
        verified={false}
        trusted={false}
        lines={[
          { key: 'livesIn', text: 'Kolkata' },
          { key: 'birthday', text: '12 March' },
        ]}
      />,
    );
    const list = document.querySelector('dl') as HTMLElement;
    expect(within(list).getByText('Lives in')).toBeInTheDocument();
    expect(within(list).getByText('12 March')).toBeInTheDocument();
    expect(screen.queryByText(/Friends|Only me|Everyone on Howdy/)).not.toBeInTheDocument();
    rerender(
      <DetailsCard
        verified={false}
        trusted={false}
        lines={[{ key: 'work', text: XSS, audience: 'only_me' }]}
      />,
    );
    expect(screen.getByText(/Only me/)).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull(); // a detail is text, never markup
  });
});

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

describe('Avatar profile photo tint', () => {
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
  it('signed in: Home / My profile / Friends / Settings with the current page marked, and unread counts as text', () => {
    render(
      <AppShell
        me={{ handle: 'chiru', displayName: 'Chiru' }}
        unread={3}
        unreadWhispers={2}
        friendRequests={1}
        visitsToday={4}
      >
        <main>page</main>
      </AppShell>,
    );
    // Both forms of the navigation exist in the DOM (CSS decides which one shows); the sidebar comes first.
    const navs = screen.getAllByRole('navigation', { name: 'Primary' });
    expect(navs).toHaveLength(2);
    const nav = within(navs[0]!);
    expect(nav.getByRole('link', { name: 'My profile' })).toHaveAttribute('href', '/profile/chiru');
    expect(nav.getByRole('link', { name: /^Friends/ })).toHaveAttribute('href', '/friends');
    expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    // Each count is text (not only a coloured pill) that says what it counts, and the link still starts with its label.
    expect(nav.getByRole('link', { name: /^Messages/ })).toHaveTextContent(/2\s*unread/);
    expect(nav.getByRole('link', { name: /^Friends/ })).toHaveTextContent(/1\s*waiting/);
    expect(nav.getByRole('link', { name: /^Visitors/ })).toHaveTextContent(/4\s*today/);
    // Notifications have the bell instead of a menu item.
    expect(nav.queryByRole('link', { name: /^Notifications/ })).not.toBeInTheDocument();
    // The top bar: a bell that says how many are unread, and the way to your own Ranch.
    expect(screen.getByRole('link', { name: 'Notifications, 3 unread' })).toHaveAttribute(
      'href',
      '/notifications',
    );
    // Your avatar opens a short account menu: your profile, Settings, Devices (managed in Settings) and Sign out.
    const account = screen.getByRole('button', { name: 'Your account' });
    expect(account).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(account);
    expect(account).toHaveAttribute('aria-expanded', 'true');
    const panel = within(screen.getByRole('region', { name: 'Your account' }));
    expect(panel.getByRole('link', { name: 'My profile' })).toHaveAttribute('href', '/profile/chiru');
    expect(panel.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(panel.getByRole('link', { name: /^Devices/ })).toHaveAttribute('href', '/settings#devices');
    expect(panel.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    // The device list and "Sign out everywhere" live in Settings, not in the menu.
    expect(panel.queryByRole('button', { name: 'Sign out everywhere…' })).not.toBeInTheDocument();
    // Phones: the pages that are not tabs are behind "More" (CSS hides it from md up), which says when one has news
    // (Visitors is in there, with today's 4).
    expect(screen.getByRole('button', { name: 'More pages, 4 new' })).toHaveAttribute(
      'aria-haspopup',
      'menu',
    );
  });
  it('signed out: only a way in, and no handle-based links', () => {
    render(
      <AppShell>
        <main>page</main>
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: /^Log in/ })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /^Sign up/ })).toHaveAttribute('href', '/signup');
    expect(screen.queryByRole('link', { name: 'My profile' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('link', { name: /^Log in/ })).not.toBeInTheDocument();
  });
});
