// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DynamicIsland } from '@/ui/island/island';
import { dismissActivity, resetIsland, showActivity } from '@/ui/island/store';
import { INSTALL_STEPS, installBrowser } from '@/ui/pwa/install-island';
import { axeViolations } from './setup';

afterEach(() => act(() => resetIsland()));

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  instagram:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

describe('which install steps a browser gets', () => {
  it('the browser’s own dialog wins whenever it is offered', () => {
    expect(installBrowser(UA.samsung, 'android', true)).toBe('offer');
  });
  it('otherwise the steps for the browser in hand', () => {
    expect(installBrowser(UA.chromeAndroid, 'android', false)).toBe('chromium');
    expect(installBrowser(UA.samsung, 'android', false)).toBe('samsung');
    expect(installBrowser(UA.firefox, 'android', false)).toBe('firefox');
    expect(installBrowser(UA.instagram, 'android', false)).toBe('in-app');
    expect(installBrowser(UA.iphone, 'ios', false)).toBe('ios');
    for (const steps of Object.values(INSTALL_STEPS)) expect(steps.length).toBeGreaterThan(0);
  });
});

describe('the Dynamic Island', () => {
  it('shows nothing until something is put in it', () => {
    const { container } = render(<DynamicIsland />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the highest-priority activity, and the next one once that is dismissed', () => {
    render(<DynamicIsland />);
    act(() => {
      showActivity({ id: 'low', priority: 1, icon: '•', label: 'Low one' });
      showActivity({ id: 'high', priority: 5, icon: '•', label: 'High one' });
    });
    expect(screen.getByRole('region', { name: 'Howdy island' })).toHaveTextContent('High one');
    act(() => dismissActivity('high'));
    expect(screen.getByRole('region', { name: 'Howdy island' })).toHaveTextContent('Low one');
  });

  it('opens and closes the expanded face; × calls onDismiss and removes it', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<DynamicIsland />);
    act(() =>
      showActivity({
        id: 'x',
        priority: 1,
        icon: '•',
        label: 'Get the Howdy app',
        expanded: () => <p>Details here</p>,
        onDismiss,
      }),
    );
    const pill = screen.getByRole('button', { name: 'Get the Howdy app' });
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    await user.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Details here')).toBeInTheDocument();
    expect(await axeViolations(document.body)).toEqual([]);
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Details here')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss: Get the Howdy app' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.queryByRole('region', { name: 'Howdy island' })).not.toBeInTheDocument();
  });
});
