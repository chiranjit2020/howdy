// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RELATIONSHIP_STATES } from '@/shared/relationship';
import {
  ChimeItem,
  Fence,
  PosseBadge,
  PostCard,
  PostCardComposer,
  PostCardReply,
  RanchHeader,
  TipHatButton,
  TownHallCard,
  TrackItem,
  TributeCard,
  WhisperBubble,
  YoButton,
  formatRelative,
} from '@/ui/howdy';
import { axeViolations } from './setup';

const author = { name: 'Sneha Roy', handle: 'sneha' };
const at = new Date('2026-09-20T10:00:00Z');

function card(overrides: Partial<Parameters<typeof PostCard>[0]> = {}) {
  return (
    <PostCard
      author={author}
      body="Late-night canteen run?"
      createdAt={at}
      stamp="North Gate"
      yoCount={3}
      yoActive={false}
      onYo={() => undefined}
      replyCount={1}
      replies={
        <PostCardReply author={{ name: 'Rahul', handle: 'rahul' }} body="Bringing coffee." createdAt={at} />
      }
      replyComposer={<PostCardComposer kind="reply" onSubmit={() => undefined} />}
      {...overrides}
    />
  );
}

describe('formatRelative', () => {
  const now = new Date('2026-09-20T12:00:00Z');
  const cases: [number, string][] = [
    [10, 'just now'],
    [5 * 60, '5m ago'],
    [3 * 3600, '3h ago'],
    [30 * 3600, 'yesterday'],
    [3 * 86400, '3d ago'],
  ];
  for (const [secondsAgo, expected] of cases) {
    it(`${secondsAgo}s ago -> ${expected}`, () => {
      expect(formatRelative(new Date(now.getTime() - secondsAgo * 1000), now)).toBe(expected);
    });
  }
  it('older than a week falls back to a short date', () => {
    expect(formatRelative(new Date('2026-08-01T00:00:00Z'), now)).toMatch(/Aug/);
  });
});

describe('YoButton', () => {
  it('exposes state with aria-pressed and a readable count; toggles on click', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(<YoButton count={1} active={false} onToggle={onToggle} />);
    const btn = screen.getByRole('button', { name: /Yo/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('1 Yo')).toBeInTheDocument();
    await user.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<YoButton count={14} active onToggle={onToggle} />);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('14 Yos')).toBeInTheDocument();
  });
});

describe('TipHatButton', () => {
  it('is disabled and says so once tipped', () => {
    render(<TipHatButton tipped onTip={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Hat tipped' })).toBeDisabled();
  });
});

describe('PostCard', () => {
  it('shows only the front at first — the back does not exist for keyboard or screen-reader users', () => {
    render(card());
    expect(screen.getByText('Late-night canteen run?')).toBeInTheDocument();
    expect(screen.queryByText('Bringing coffee.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Scribbles' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); // reply composer lives on the back
  });

  it('Flip shows only the back (and moves focus to Back); Back returns (and focuses Flip)', async () => {
    const user = userEvent.setup();
    render(card());
    await user.click(screen.getByRole('button', { name: /Flip/ }));
    expect(screen.queryByText('Late-night canteen run?')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Scribbles' })).toBeInTheDocument();
    expect(screen.getByText('Bringing coffee.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to card/ })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: /Back to card/ }));
    expect(screen.getByText('Late-night canteen run?')).toBeInTheDocument();
    expect(screen.queryByText('Bringing coffee.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Flip/ })).toHaveFocus();
  });

  it('the initial render does not steal focus', () => {
    render(card());
    expect(document.body).toHaveFocus();
  });

  it('double-click drops a Yo once, but never removes one', async () => {
    const user = userEvent.setup();
    const onYo = vi.fn();
    const { rerender } = render(card({ onYo }));
    await user.dblClick(screen.getByText('Late-night canteen run?'));
    expect(onYo).toHaveBeenCalledTimes(1);
    rerender(card({ onYo, yoActive: true }));
    await user.dblClick(screen.getByText('Late-night canteen run?'));
    expect(onYo).toHaveBeenCalledTimes(1);
  });

  it('renders the message as text — markup in a body is never interpreted', () => {
    const { container } = render(card({ body: '<img src=x onerror=alert(1)><b>hi</b>' }));
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)><b>hi</b>')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<main>{card()}</main>);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('PostCardComposer', () => {
  it('uses the product limits: 160 for cards, 80 for replies', () => {
    const { unmount } = render(<PostCardComposer kind="card" onSubmit={() => undefined} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '160');
    unmount();
    render(<PostCardComposer kind="reply" onSubmit={() => undefined} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '80');
  });

  it('cannot submit empty or whitespace-only text', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PostCardComposer kind="card" onSubmit={onSubmit} />);
    const submit = screen.getByRole('button', { name: 'Nail to Fence' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByRole('textbox'), '   ');
    expect(submit).toBeDisabled();
  });

  it('submits trimmed text once and clears the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PostCardComposer kind="card" onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox'), '  hello fence  ');
    await user.click(screen.getByRole('button', { name: 'Nail to Fence' }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('hello fence');
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});

describe('TrackItem (privacy)', () => {
  it('a hidden track never reveals the visitor and shows only a coarse bucket, never a timestamp', () => {
    const { container } = render(
      <ul>
        <TrackItem when="today" hint="Someone who shares 4 mutual friends stopped by." />
      </ul>,
    );
    expect(screen.getByText('Hidden track')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(container.querySelector('time')).toBeNull();
    expect(container.textContent).not.toMatch(/@|\d{1,2}:\d{2}|\bago\b/);
  });

  it('a revealed track shows who visited', () => {
    render(
      <ul>
        <TrackItem visitor={{ name: 'Alex Kumar', handle: 'alex' }} when="yesterday" />
      </ul>,
    );
    expect(screen.getByText('Alex Kumar')).toBeInTheDocument();
    expect(screen.getByText('@alex')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });
});

describe('TributeCard', () => {
  it('pending tributes show the approval state and owner actions; published ones do not', () => {
    const { rerender } = render(
      <TributeCard
        status="pending"
        authorHandle="priya"
        body="Great"
        actions={<button type="button">Approve</button>}
      />,
    );
    expect(screen.getByText('Waiting for your approval')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    rerender(
      <TributeCard
        status="published"
        authorHandle="priya"
        body="Great"
        actions={<button type="button">Approve</button>}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for your approval')).not.toBeInTheDocument();
  });
});

describe('PosseBadge', () => {
  it('renders text for every visible state and nothing for UNKNOWN', () => {
    for (const state of RELATIONSHIP_STATES) {
      const { container, unmount } = render(<PosseBadge state={state} />);
      if (state === 'UNKNOWN') expect(container).toBeEmptyDOMElement();
      else expect(container.textContent?.length).toBeGreaterThan(2);
      unmount();
    }
  });
  it('shows a block as "Outlaw"', () => {
    render(<PosseBadge state="BLOCKED" />);
    expect(screen.getByText('Outlaw')).toBeInTheDocument();
  });
});

describe('WhisperBubble', () => {
  it('outgoing bubbles show delivery status as text; incoming bubbles show none', () => {
    const { container } = render(
      <>
        <WhisperBubble direction="out" body="On my way" time="10:16 PM" status="seen" />
        <WhisperBubble direction="in" body="Cool" time="10:17 PM" status="seen" />
      </>,
    );
    expect(screen.getAllByText(/Seen/)).toHaveLength(1);
    expect(container.textContent).toContain('You said: On my way');
    expect(container.textContent).toContain('They said: Cool');
  });
});

describe('Fence', () => {
  it('shows an empty state when there are no cards, and no "older" button unless there is more', () => {
    render(<Fence />);
    expect(screen.getByText('Nothing nailed up yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Older cards' })).not.toBeInTheDocument();
  });

  it('lists cards in order and offers explicit pagination when there is more', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <Fence hasMore onLoadMore={onLoadMore}>
        {card({ body: 'first' })}
        {card({ body: 'second' })}
      </Fence>,
    );
    // the Fence is the first list; each card also contains its own replies list
    const items = Array.from(screen.getAllByRole('list')[0]!.children);
    expect(items[0]).toHaveTextContent('first');
    expect(items[1]).toHaveTextContent('second');
    await user.click(screen.getByRole('button', { name: 'Older cards' }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('is a labelled region', () => {
    render(<Fence />);
    expect(screen.getByRole('region', { name: 'The Fence' })).toBeInTheDocument();
  });
});

describe('ChimeItem, TownHallCard, RanchHeader', () => {
  it('unread chimes are announced as unread', () => {
    render(
      <ul>
        <ChimeItem type="YO_DROPPED" text="Sneha dropped a Yo." createdAt={at} unread />
      </ul>,
    );
    expect(screen.getByText(/Unread:/)).toBeInTheDocument();
  });

  it('town halls show visibility but no member counts', () => {
    const { container } = render(
      <TownHallCard name="Night Owls" description="Awake past 2am" visibility="members" />,
    );
    expect(screen.getByText('Members only')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+\s*(members|people)/i);
  });

  it('a Ranch header has a single h1 with the display name and shows the Signal', () => {
    render(
      <RanchHeader displayName="Chiranjit" handle="chiranjit" signal="Writing code" relationship="POSSE" />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Chiranjit' })).toBeInTheDocument();
    expect(screen.getByText('@chiranjit')).toBeInTheDocument();
    expect(screen.getByText('Writing code')).toBeInTheDocument();
    expect(screen.getByText('Pal')).toBeInTheDocument();
  });

  it('a composed Ranch has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <RanchHeader
          displayName="Chiranjit"
          handle="chiranjit"
          online
          signal="Writing code"
          relationship="POSSE"
        />
        <Fence>{card()}</Fence>
        <ul>
          <TrackItem when="today" />
          <ChimeItem type="TRACK_CREATED" text="Someone left Tracks." createdAt={at} unread />
        </ul>
        <TributeCard status="published" authorHandle="alex" body="Machine." pinned />
        <TownHallCard name="Night Owls" description="Awake" visibility="open" />
        <WhisperBubble direction="out" body="hi" time="10:00 PM" status="sent" />
      </main>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
