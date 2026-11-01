// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';

/** The browser-facing parts are mocked: jsdom has no push or install prompt. */
const pwa = vi.hoisted(() => ({
  canPromptInstall: vi.fn(() => false),
  isInstalled: vi.fn(() => true),
  onInstallChange: vi.fn(() => () => undefined),
  platform: vi.fn(() => 'android' as 'android' | 'ios' | 'other'),
  promptInstall: vi.fn(async () => undefined),
  pushState: vi.fn(async () => 'off' as 'on' | 'off' | 'blocked' | 'unsupported'),
  enablePush: vi.fn(async () => 'on' as 'on' | 'off' | 'blocked'),
  disablePush: vi.fn(async () => 'off' as 'on' | 'off'),
}));
vi.mock('@/ui/pwa/pwa', () => pwa);
const { AppOnPhone } = await import('@/ui/pwa/app-on-phone');

beforeEach(() => {
  pwa.pushState.mockResolvedValue('off');
  pwa.enablePush.mockResolvedValue('on');
  pwa.disablePush.mockResolvedValue('off');
});

describe('"Howdy on your phone": notifications on this device', () => {
  it('is a switch named by its label, that turns notifications on and off', async () => {
    const user = userEvent.setup();
    render(<AppOnPhone vapidKey={'k'.repeat(87)} />);
    const toggle = await screen.findByRole('switch', { name: 'Notifications on this device' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    // No old-style button any more.
    expect(screen.queryByRole('button', { name: /Turn (on|off)/ })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(pwa.enablePush).toHaveBeenCalled();
    expect(await screen.findByRole('switch', { name: 'Notifications on this device' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('switch', { name: 'Notifications on this device' }));
    expect(pwa.disablePush).toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Notifications on this device' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('when notifications are blocked there is no switch, only how to allow them', async () => {
    pwa.pushState.mockResolvedValue('blocked');
    render(<AppOnPhone vapidKey={'k'.repeat(87)} />);
    expect(await screen.findByText(/Blocked for Howdy/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
