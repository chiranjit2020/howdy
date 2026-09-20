// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  Chip,
  ConfirmationDialog,
  Dropdown,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
  Modal,
  Navigation,
  Popover,
  Radio,
  Select,
  Switch,
  Tabs,
  Textarea,
  ToastProvider,
  Tooltip,
  useToast,
} from '@/ui/primitives';
import { axeViolations } from './setup';

describe('accessibility (axe)', () => {
  it('a broad composition of primitives has no violations', async () => {
    const { container } = render(
      <main>
        <h1>Kit</h1>
        <h2>Section</h2>
        <Button>Save</Button>
        <Button loading>Saving</Button>
        <IconButton label="Close">×</IconButton>
        <Input label="Handle" hint="3–24 chars" />
        <Input label="Secret Knock" type="password" error="Too short" />
        <Textarea label="Signal" maxLength={80} showCount />
        <Select label="Visibility" defaultValue="a">
          <option value="a">Anyone</option>
        </Select>
        <Checkbox label="Review cards" />
        <fieldset>
          <legend>Whispers</legend>
          <Radio name="w" label="Posse" defaultChecked />
          <Radio name="w" label="Anyone" />
        </fieldset>
        <Switch label="Shadow Walk" checked onCheckedChange={() => undefined} />
        <Avatar name="Sneha Roy" online />
        <Badge>New</Badge>
        <Chip selected onSelect={() => undefined}>
          Campus
        </Chip>
        <Chip onRemove={() => undefined} removeLabel="Remove Hall B">
          Hall B
        </Chip>
        <Tabs
          label="Sections"
          tabs={[
            { id: 'a', label: 'One', panel: <p>A</p> },
            { id: 'b', label: 'Two', panel: <p>B</p> },
          ]}
        />
        <Navigation
          label="Main"
          items={[
            { href: '/a', label: 'Ranch', current: true },
            { href: '/b', label: 'Fence' },
          ]}
        />
        <EmptyState title="Nothing yet" description="Come back later" />
        <ErrorState requestId="abc" onRetry={() => undefined} />
        <LoadingState />
      </main>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Button', () => {
  it('loading disables the button and sets aria-busy', () => {
    render(<Button loading>Saving</Button>);
    const b = screen.getByRole('button', { name: 'Saving' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
  });

  it('defaults to type=button so it never submits a form by accident', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('form fields', () => {
  it('links label, hint and error to the control', () => {
    render(<Input label="Handle" hint="Pick a call sign" error="Taken" />);
    const input = screen.getByLabelText('Handle');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby')!.split(' ');
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'Pick a call sign',
      'Taken',
    ]);
  });

  it('Textarea enforces maxLength and shows a live counter', async () => {
    const user = userEvent.setup();
    render(<Textarea label="Card" maxLength={10} showCount />);
    const ta = screen.getByLabelText('Card');
    expect(ta).toHaveAttribute('maxlength', '10');
    expect(screen.getByText(/0\/10/)).toBeInTheDocument();
    await user.type(ta, 'hello');
    expect(screen.getByText(/5\/10/)).toBeInTheDocument();
    expect(ta.getAttribute('aria-describedby')).toContain(screen.getByText(/5\/10/).closest('p')!.id);
  });
});

describe('Switch', () => {
  function Demo() {
    const [on, setOn] = useState(false);
    return <Switch label="Shadow Walk" checked={on} onCheckedChange={setOn} />;
  }
  it('toggles with the keyboard and exposes aria-checked', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const sw = screen.getByRole('switch', { name: 'Shadow Walk' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await user.tab();
    expect(sw).toHaveFocus();
    await user.keyboard(' ');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Enter}');
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });
});

describe('Tabs', () => {
  const tabs = [
    { id: 'a', label: 'Fence', panel: <p>fence panel</p> },
    { id: 'b', label: 'Tributes', panel: <p>tributes panel</p> },
    { id: 'c', label: 'Posse', panel: <p>posse panel</p> },
  ];

  it('roving tabindex: arrows/Home/End move selection and focus', async () => {
    const user = userEvent.setup();
    render(<Tabs label="Ranch" tabs={tabs} />);
    const [t1, t2, t3] = screen.getAllByRole('tab');
    expect(t1).toHaveAttribute('tabindex', '0');
    expect(t2).toHaveAttribute('tabindex', '-1');
    await user.click(t1!);
    await user.keyboard('{ArrowRight}');
    expect(t2).toHaveFocus();
    expect(t2).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('tributes panel')).toBeVisible();
    expect(screen.queryByText('fence panel')).not.toBeInTheDocument();
    await user.keyboard('{End}');
    expect(t3).toHaveFocus();
    await user.keyboard('{ArrowRight}'); // wraps
    expect(t1).toHaveFocus();
    await user.keyboard('{ArrowLeft}'); // wraps back
    expect(t3).toHaveFocus();
  });

  it('panel is labelled by its tab', () => {
    render(<Tabs label="Ranch" tabs={tabs} />);
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Fence');
  });
});

describe('Dropdown (menu button)', () => {
  const setup = () => {
    const onScrape = vi.fn();
    const onFlag = vi.fn();
    const user = userEvent.setup();
    render(
      <Dropdown
        label="Card actions"
        trigger={(p) => (
          <button type="button" {...p}>
            Menu
          </button>
        )}
        items={[
          { id: 'scrape', label: 'Scrape clean', onSelect: onScrape },
          { id: 'na', label: 'Unavailable', disabled: true, onSelect: () => undefined },
          { id: 'flag', label: 'Flag trouble', onSelect: onFlag },
        ]}
      />,
    );
    return { user, onScrape, onFlag, trigger: screen.getByRole('button', { name: 'Menu' }) };
  };

  it('opens with focus on the first item; arrows skip disabled items and wrap', async () => {
    const { user, trigger } = setup();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(items[2]).toHaveFocus(); // skipped the disabled one
    await user.keyboard('{ArrowDown}');
    expect(items[0]).toHaveFocus(); // wrapped
    await user.keyboard('{End}');
    expect(items[2]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(items[0]).toHaveFocus();
  });

  it('Escape closes and returns focus to the trigger', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('activating an item runs its action once and closes the menu', async () => {
    const { user, trigger, onFlag, onScrape } = setup();
    await user.click(trigger);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onFlag).toHaveBeenCalledTimes(1);
    expect(onScrape).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('ArrowDown on the closed trigger opens the menu', async () => {
    const { user, trigger } = setup();
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});

describe('Popover', () => {
  it('toggles, closes on Escape and outside press, and restores focus', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">outside</button>
        <Popover
          label="Boundary lines"
          trigger={(p) => (
            <button type="button" {...p}>
              Open
            </button>
          )}
        >
          <p>panel body</p>
        </Popover>
      </div>,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Boundary lines' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  it('appears on keyboard focus, is described-by the control, and Escape dismisses it', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Tip your hat">
        <button type="button">Tip</button>
      </Tooltip>,
    );
    const btn = screen.getByRole('button', { name: 'Tip' });
    const tip = document.querySelector('[role="tooltip"]') as HTMLElement;
    expect(tip).toBeInTheDocument();
    expect(tip).not.toBeVisible();
    expect(btn).toHaveAttribute('aria-describedby', tip.id);
    await user.tab();
    await waitFor(() => expect(tip).toBeVisible());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(tip).not.toBeVisible());
  });
});

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  function Trigger({ tone }: { tone?: 'danger' | 'success' }) {
    const toast = useToast();
    return (
      <button
        type="button"
        onClick={() => toast({ title: 'Nailed', description: 'It is up', ...(tone ? { tone } : {}) })}
      >
        go
      </button>
    );
  }

  it('announces politely by default and as an alert for errors', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger />
        <Trigger tone="danger" />
      </ToastProvider>,
    );
    const [ok, bad] = screen.getAllByRole('button', { name: 'go' });
    await user.click(ok!);
    expect(screen.getByRole('status')).toHaveTextContent('Nailed');
    await user.click(bad!);
    expect(screen.getByRole('alert')).toHaveTextContent('Nailed');
  });

  it('auto-dismisses after 5s, but not while hovered', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'go' }));
    const toast = screen.getByRole('status');
    await user.hover(toast);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('status')).toBeInTheDocument(); // paused
    await user.unhover(toast);
    act(() => void vi.advanceTimersByTime(5_100));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('can be dismissed manually', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'go' }));
    await user.click(
      within(screen.getByRole('status')).getByRole('button', { name: 'Dismiss notification' }),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('useToast outside a provider fails loudly', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe('Modal and ConfirmationDialog', () => {
  it('Modal is labelled by its title, opens the native dialog, and closes via the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Tend the Ranch" description="Edits appear on save.">
        <p>body</p>
      </Modal>,
    );
    const dlg = screen.getByRole('dialog', { name: 'Tend the Ranch', hidden: true });
    expect(dlg).toHaveAttribute('open');
    expect(dlg).toHaveAccessibleDescription('Edits appear on save.');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closed Modal renders no content', () => {
    render(
      <Modal open={false} onClose={() => undefined} title="Hidden">
        <p>secret body</p>
      </Modal>,
    );
    expect(screen.queryByText('secret body')).not.toBeInTheDocument();
  });

  it('clicking the backdrop (the dialog element itself) closes; clicking content does not', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="T">
        <p>inside</p>
      </Modal>,
    );
    await user.click(screen.getByText('inside'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('dialog', { hidden: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ConfirmationDialog is an alertdialog; Cancel is focused first; buttons call the right handlers', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmationDialog
        open
        destructive
        title="Burn the Deed?"
        description="This cannot be undone."
        confirmLabel="Burn it"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('alertdialog', { name: 'Burn the Deed?', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Burn it' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('Chip', () => {
  it('toggle chips expose aria-pressed; remove button has its own name', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <>
        <Chip selected onSelect={() => undefined}>
          Campus
        </Chip>
        <Chip onRemove={onRemove} removeLabel="Remove Hall B">
          Hall B
        </Chip>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Campus' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Hall B' })).not.toHaveAttribute('aria-pressed');
    await user.click(screen.getByRole('button', { name: 'Remove Hall B' }));
    expect(onRemove).toHaveBeenCalled();
  });
});

describe('Navigation', () => {
  it('marks the current page with aria-current', () => {
    render(
      <Navigation
        label="Main"
        items={[
          { href: '/a', label: 'Ranch', current: true },
          { href: '/b', label: 'Fence' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Ranch' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Fence' })).not.toHaveAttribute('aria-current');
  });
});
