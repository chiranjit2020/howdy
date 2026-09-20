// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PORTRAIT_TINTS } from '@/shared/validation/profile';
import { RanchHeader } from '@/ui/howdy';
import { Avatar } from '@/ui/primitives';
import { SiteHeader } from '@/ui/site-header';
import { axeViolations } from './setup';

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

describe('SiteHeader', () => {
  it('signed in: Home / My Ranch / Posse / Workshop with the current page marked', () => {
    render(<SiteHeader handle="chiru" current="workshop" />);
    expect(screen.getByRole('link', { name: 'My Ranch' })).toHaveAttribute('href', '/ranch/chiru');
    expect(screen.getByRole('link', { name: 'Posse' })).toHaveAttribute('href', '/posse');
    expect(screen.getByRole('link', { name: 'Workshop' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });
  it('signed out: only a way in, and no handle-based links', () => {
    render(<SiteHeader />);
    expect(screen.getByRole('link', { name: 'Step Inside' })).toHaveAttribute('href', '/step-inside');
    expect(screen.queryByRole('link', { name: 'My Ranch' })).not.toBeInTheDocument();
  });
});
