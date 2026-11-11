// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DynamicIsland } from '@/ui/island/island';
import { dismissActivity, resetIsland, showActivity } from '@/ui/island/store';
import { GetAppBar } from '@/app/(app)/home/get-app-bar';
import { canPromptInstall, captureInstallPrompt, installedOnThisDevice } from '@/ui/pwa/pwa';
import { chromeIntentUrl, installAction, installBrowser, isPhoneAgent, osOf } from '@/ui/pwa/install-steps';
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
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0',
  // A Poco phone's own browser (2026-11-11): looks like Chrome, cannot install.
  miBrowser:
    'Mozilla/5.0 (Linux; U; Android 14; en-in; 23049PCD8I Build/UKQ1.230804.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.119 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.12.0-gn',
  pocoChrome:
    'Mozilla/5.0 (Linux; Android 14; 23049PCD8I) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
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

describe('Home’s “Get the Howdy app” bar (replaced the island’s pop-up)', () => {
  afterEach(() => {
    document.cookie = 'howdy_get_app_compact=; Max-Age=0; Path=/';
  });

  it('each browser gets one thing to do, never a numbered list', () => {
    const act_ = (ua: string, offer = false) => installAction(installBrowser(ua, osOf(ua), offer), osOf(ua));
    expect(act_(UA.chromeAndroid, true)).toBe('install');
    expect(act_(UA.chromeAndroid)).toBe('install');
    expect(act_(UA.iphone)).toBe('home-screen');
    expect(act_(UA.instagram)).toBe('open-chrome');
    expect(act_(UA.iphoneInstagram)).toBe('none');
    // Mi Browser cannot install: send them to Chrome. Chrome on the same Poco phone installs.
    expect(act_(UA.miBrowser)).toBe('open-chrome');
    expect(act_(UA.pocoChrome)).toBe('install');
    expect(chromeIntentUrl('https://howdy.example/home?x=1')).toBe(
      'intent://howdy.example/home?x=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fhowdy.example%2Fhome%3Fx%3D1;end',
    );
  });

  it('iPhone: “Add to Home Screen”, and a tap shows the one line with the Share icon', async () => {
    const user = userEvent.setup();
    const { container } = render(<GetAppBar ua={UA.iphone} />);
    expect(screen.getByRole('heading', { name: 'Get the Howdy app' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await user.click(screen.getByRole('button', { name: 'Add to Home Screen' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tap Share in your browser’s bar, then Add to Home Screen.',
    );
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('Instagram on iPhone: no button that cannot work, just the line to open Safari', () => {
    render(<GetAppBar ua={UA.iphoneInstagram} />);
    expect(screen.queryByRole('button', { name: /Install|Add to Home|Open in/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('open this page in Safari');
  });

  it('Instagram on Android: “Open in Chrome”', () => {
    render(<GetAppBar ua={UA.instagram} />);
    expect(screen.getByRole('button', { name: 'Open in Chrome' })).toBeInTheDocument();
  });

  it('“Not now” shrinks it to one slim line that stays (what is missed + Install), and remembers that', async () => {
    const user = userEvent.setup();
    const { container } = render(<GetAppBar ua={UA.chromeAndroid} />);
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('heading', { name: 'Get the Howdy app' })).not.toBeInTheDocument();
    const slim = screen.getByRole('region', { name: 'Get the Howdy app' });
    expect(slim).toHaveTextContent('You’re missing message notifications.');
    expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument(); // nothing more to wave away
    expect(screen.getByRole('button', { name: 'Install' })).toHaveFocus();
    expect(document.cookie).toContain('howdy_get_app_compact=1');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('slim from the first paint once chosen; on iPhone its Install shows the Share hint', async () => {
    const user = userEvent.setup();
    render(<GetAppBar ua={UA.iphone} compact />);
    expect(screen.queryByRole('heading', { name: 'Get the Howdy app' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).not.toHaveFocus(); // focus moves only after a tap
    await user.click(screen.getByRole('button', { name: 'Install' }));
    expect(screen.getByRole('status')).toHaveTextContent('Tap Share in your browser’s bar');
  });

  it('goes away as soon as the browser says Howdy was installed', () => {
    render(<GetAppBar ua={UA.chromeAndroid} />);
    act(() => void window.dispatchEvent(new Event('appinstalled')));
    expect(screen.queryByRole('heading', { name: 'Get the Howdy app' })).not.toBeInTheDocument();
  });

  it('only phones get it', () => {
    expect(isPhoneAgent(UA.iphone)).toBe(true);
    expect(isPhoneAgent(UA.samsung)).toBe(true);
    expect(isPhoneAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0 Safari/537.36')).toBe(false);
    expect(isPhoneAgent(null)).toBe(false);
  });
});

describe('the install offer, caught before the app runs (RootLayout’s catcher)', () => {
  type W = Window & { __howdyInstall?: unknown };
  afterEach(() => {
    (window as W).__howdyInstall = null;
  });

  it('an offer that arrived before the bar mounted is used: the button opens the browser’s own box', async () => {
    const prompt = vi.fn(async () => undefined);
    (window as W).__howdyInstall = { prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }) };
    const user = userEvent.setup();
    render(<GetAppBar ua={UA.pocoChrome} />);
    await user.click(screen.getByRole('button', { name: 'Install Howdy' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toBeEmptyDOMElement(); // no menu hint when the box was offered
  });

  it('an offer that arrives later is picked up from the catcher’s event', async () => {
    const off = captureInstallPrompt();
    render(<GetAppBar ua={UA.pocoChrome} />);
    expect(canPromptInstall()).toBe(false);
    act(() => {
      (window as W).__howdyInstall = { prompt: vi.fn(), userChoice: new Promise(() => undefined) };
      window.dispatchEvent(new Event('howdy:installoffer'));
    });
    expect(canPromptInstall()).toBe(true);
    off();
  });
});

describe('already installed on this phone (Android Chrome’s getInstalledRelatedApps)', () => {
  type N = Navigator & { getInstalledRelatedApps?: () => Promise<{ platform: string }[]> };
  afterEach(() => {
    delete (navigator as N).getInstalledRelatedApps;
  });

  it('the bar steps aside: Chrome would not offer to install it again', async () => {
    (navigator as N).getInstalledRelatedApps = async () => [{ platform: 'webapp' }];
    render(<GetAppBar ua={UA.pocoChrome} />);
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Get the Howdy app' })).not.toBeInTheDocument(),
    );
  });

  it('not installed, or a browser that cannot tell: the bar stays', async () => {
    (navigator as N).getInstalledRelatedApps = async () => [];
    render(<GetAppBar ua={UA.pocoChrome} />);
    expect(await installedOnThisDevice()).toBe(false);
    expect(screen.getByRole('region', { name: 'Get the Howdy app' })).toBeInTheDocument();
    delete (navigator as N).getInstalledRelatedApps;
    expect(await installedOnThisDevice()).toBe(false);
  });
});
