// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamicIsland } from '@/ui/island/island';
import { currentActivity, resetIsland } from '@/ui/island/store';
import './setup';

/** The browser-facing parts are mocked: jsdom has no push, and headless browsers say "denied" before anyone asks. */
const pwa = vi.hoisted(() => ({
  platform: vi.fn(() => 'android' as 'android' | 'ios' | 'other'),
  isInstalled: vi.fn(() => false),
  pushState: vi.fn(async () => 'off' as const),
  enablePush: vi.fn(async () => 'on' as 'on' | 'off' | 'blocked'),
}));
vi.mock('@/ui/pwa/pwa', () => pwa);
const { ChimesIsland } = await import('@/ui/pwa/chimes-island');

const KEY = 'howdy.island.chimes.dismissedAt';
let permission: NotificationPermission = 'default';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  permission = 'default';
  vi.stubGlobal('Notification', {
    get permission() {
      return permission;
    },
  });
  localStorage.clear();
  pwa.platform.mockReturnValue('android');
  pwa.isInstalled.mockReturnValue(false);
  pwa.enablePush.mockResolvedValue('on');
});
afterEach(() => {
  act(() => resetIsland());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount(vapidKey: string | undefined = 'k'.repeat(87)) {
  render(
    <>
      <DynamicIsland />
      <ChimesIsland vapidKey={vapidKey} />
    </>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4500);
  });
}
const pill = () => screen.queryByRole('button', { name: 'Get Chimes on this phone' });

describe('the "Get Chimes on this phone" island', () => {
  it('appears on an Android phone that has not been asked yet', async () => {
    await mount();
    expect(pill()).toBeInTheDocument();
  });

  it.each([
    ['the browser already said no', (): void => void (permission = 'denied'), 'k'.repeat(87)],
    ['the browser already said yes', (): void => void (permission = 'granted'), 'k'.repeat(87)],
    ['there is no push key', (): void => undefined, undefined],
    ['on a computer', (): void => void pwa.platform.mockReturnValue('other'), 'k'.repeat(87)],
    ['in an iPhone browser tab', (): void => void pwa.platform.mockReturnValue('ios'), 'k'.repeat(87)],
  ] as const)('stays away when %s', async (_why, setup, key) => {
    setup();
    render(<ChimesIsland vapidKey={key} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    expect(currentActivity()).toBeNull();
  });

  it('on an iPhone it waits until Howdy is installed', async () => {
    pwa.platform.mockReturnValue('ios');
    pwa.isInstalled.mockReturnValue(true);
    await mount();
    expect(pill()).toBeInTheDocument();
  });

  it('asks the browser only when the button is tapped, then goes away', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    expect(pwa.enablePush).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // opens by itself
    });
    await user.click(screen.getByRole('button', { name: 'Turn on Chimes' }));
    expect(pwa.enablePush).toHaveBeenCalledOnce();
    expect(pill()).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull(); // turned on: nothing to snooze
  });

  it('a refusal, or ×, snoozes it for 14 days on this device', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    pwa.enablePush.mockResolvedValue('blocked');
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await user.click(screen.getByRole('button', { name: 'Turn on Chimes' }));
    expect(localStorage.getItem(KEY)).not.toBeNull();
    act(() => resetIsland());

    render(<ChimesIsland vapidKey={'k'.repeat(87)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    expect(pill()).not.toBeInTheDocument();
  });
});
