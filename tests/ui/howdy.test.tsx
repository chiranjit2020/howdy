// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
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
  VibeMatrix,
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
      reactions={{ yo: 2, laugh: 1, fire: 0, popcorn: 0, love: 0 }}
      myReaction={null}
      onReact={() => undefined}
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
    const btn = screen.getByRole('button', { name: /Wave/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('1 wave')).toBeInTheDocument();
    await user.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<YoButton count={14} active onToggle={onToggle} />);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('14 waves')).toBeInTheDocument();
  });
});

describe('VibeMatrix', () => {
  const counts = (gem: number, pure: number) => ({ gem, pure, chill: 0, sharp: 0, bold: 0 });

  it('shows earned counts with meanings below 20 badges, and the percentage bars from 20', () => {
    const { rerender } = render(<VibeMatrix counts={counts(12, 7)} total={19} />);
    expect(screen.getByText('Rare, genuinely valuable')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === '12 badges')).toBeInTheDocument(); // count + hidden word
    expect(
      screen.getByText(/19 badges total\. The percentages show up after 20 — 1 to go\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /%$/ })).not.toBeInTheDocument();

    rerender(<VibeMatrix counts={counts(13, 7)} total={20} />);
    expect(screen.getByRole('img', { name: 'Gem: 13 badges, 65%' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Bold: 0 badges, 0%' })).toBeInTheDocument();
    expect(screen.getByText('20 badges total.')).toBeInTheDocument();
    expect(screen.queryByText('Rare, genuinely valuable')).not.toBeInTheDocument();
  });

  it('offers five picks only when there is somewhere to send them, disabled with the reason when not allowed', () => {
    const { rerender } = render(<VibeMatrix counts={counts(0, 0)} total={0} />);
    expect(screen.queryByRole('group', { name: 'Give a badge' })).not.toBeInTheDocument();
    rerender(
      <VibeMatrix
        counts={counts(0, 0)}
        total={0}
        canGive={false}
        onGive={() => undefined}
        disabledHint="You can give them a badge again in 3 days."
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(5);
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
    expect(screen.getByText('You can give them a badge again in 3 days.')).toBeInTheDocument();
  });
});

describe('TipHatButton', () => {
  it('is disabled and says so once tipped', () => {
    render(<TipHatButton tipped onTip={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Poked' })).toBeDisabled();
  });
});

describe('PostCard', () => {
  it('shows the post with its newest replies under it; the reply box waits for Reply', () => {
    render(card());
    expect(screen.getByText('Late-night canteen run?')).toBeInTheDocument();
    expect(screen.getByText('Bringing coffee.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // The username stays beside the name: names are not unique.
    expect(screen.getByText(/@sneha/)).toBeInTheDocument();
  });

  it('shows the newest two replies; "View all" opens the rest', async () => {
    const user = userEvent.setup();
    const replies = ['one', 'two', 'three'].map((b) => (
      <PostCardReply key={b} author={{ name: 'Rahul', handle: 'rahul' }} body={b} createdAt={at} />
    ));
    render(card({ replies, replyCount: 3 }));
    expect(screen.queryByText('one')).not.toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getByText('three')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View all 3 replies' }));
    expect(screen.getByText('one')).toBeInTheDocument();
  });

  it('"Reply" under a reply opens the box addressed to that person, cursor after the name', async () => {
    const user = userEvent.setup();
    render(card());
    await user.click(screen.getByRole('button', { name: 'Reply to Rahul' }));
    const box = screen.getByRole('textbox', { name: /Write a reply/ });
    expect(box).toHaveValue('@rahul ');
    expect(box).toHaveFocus();
    expect((box as HTMLInputElement).selectionStart).toBe('@rahul '.length);
  });

  it('no Reply link under replies where the viewer may not reply', () => {
    render(card({ replyComposer: undefined }));
    expect(screen.queryByRole('button', { name: 'Reply to Rahul' })).not.toBeInTheDocument();
  });

  it('a reply that starts with @handle shows the name as a link to their profile', () => {
    render(
      card({
        replies: (
          <PostCardReply
            author={{ name: 'Rahul', handle: 'rahul' }}
            body="@sneha see you there"
            createdAt={at}
          />
        ),
      }),
    );
    expect(screen.getByRole('link', { name: '@sneha' })).toHaveAttribute('href', '/profile/sneha');
    expect(screen.getByText(/see you there/)).toBeInTheDocument();
  });

  it('counts replies wrapped in a fragment one by one', () => {
    const r = (b: string) => (
      <PostCardReply author={{ name: 'Rahul', handle: 'rahul' }} body={b} createdAt={at} />
    );
    render(
      card({
        replies: (
          <>
            {r('one')}
            {r('two')}
            {r('three')}
          </>
        ),
        replyCount: 3,
      }),
    );
    expect(screen.queryByText('one')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View all 3 replies' })).toBeInTheDocument();
  });

  it('Reply opens the reply box and puts the cursor in it; the post stays in view', async () => {
    const user = userEvent.setup();
    render(card());
    const reply = screen.getByRole('button', { name: /^Reply$/ });
    expect(reply).toHaveAttribute('aria-expanded', 'false');
    await user.click(reply);
    expect(reply).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: /Write a reply/ })).toHaveFocus();
    expect(screen.getByText('Late-night canteen run?')).toBeInTheDocument();
  });

  it('one row: your reaction, the counts and Reply sit together; the reply count is not repeated above it', () => {
    render(card());
    const row = screen.getByRole('button', { name: /^Reply$/ }).closest('footer')!;
    expect(row).toContainElement(screen.getByRole('button', { name: 'Wave' }));
    expect(row).toContainElement(screen.getByRole('img', { name: /3 reactions/ }));
    expect(screen.queryByRole('button', { name: '1 reply' })).not.toBeInTheDocument();
  });

  it('the initial render does not steal focus', () => {
    render(card());
    expect(document.body).toHaveFocus();
  });

  it('double-click drops a Yo once, but never removes or replaces a reaction', async () => {
    const user = userEvent.setup();
    const onReact = vi.fn();
    const { rerender } = render(card({ onReact }));
    await user.dblClick(screen.getByText('Late-night canteen run?'));
    expect(onReact).toHaveBeenCalledTimes(1);
    expect(onReact).toHaveBeenLastCalledWith('yo');
    rerender(card({ onReact, myReaction: 'laugh' }));
    await user.dblClick(screen.getByText('Late-night canteen run?'));
    expect(onReact).toHaveBeenCalledTimes(1);
  });

  it('reactions: one tap gives a Yo, the picker switches or takes back, and the summary reads out the counts', async () => {
    const user = userEvent.setup();
    const onReact = vi.fn();
    const { rerender } = render(card({ onReact }));
    expect(screen.getByRole('img', { name: '3 reactions: 2 Wave, 1 Laugh' })).toBeInTheDocument();
    const main = screen.getByRole('button', { name: 'Wave' });
    expect(main).toHaveAttribute('aria-pressed', 'false');
    await user.click(main);
    expect(onReact).toHaveBeenLastCalledWith('yo');

    await user.click(screen.getByRole('button', { name: 'More reactions' }));
    await user.click(screen.getByRole('button', { name: 'Popcorn' }));
    expect(onReact).toHaveBeenLastCalledWith('popcorn');
    expect(screen.queryByRole('dialog', { name: 'Reactions' })).not.toBeInTheDocument(); // a pick closes the picker

    rerender(card({ onReact, myReaction: 'popcorn' }));
    const mine = screen.getByRole('button', { name: 'Popcorn' }); // the main button now shows your reaction
    expect(mine).toHaveAttribute('aria-pressed', 'true');
    await user.click(mine); // tapping it takes yours back
    expect(onReact).toHaveBeenLastCalledWith(null);
    await user.click(screen.getByRole('button', { name: 'More reactions' }));
    const picker = screen.getByRole('dialog', { name: 'Reactions' });
    await user.click(within(picker).getByRole('button', { name: 'Popcorn', pressed: true }));
    expect(onReact).toHaveBeenLastCalledWith(null);
  });

  it('without the right to react, only the summary shows', () => {
    render(card({ canReact: false }));
    expect(screen.queryByRole('button', { name: 'Wave' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More reactions' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /3 reactions/ })).toBeInTheDocument();
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
    // One line until you click in: no Post button yet.
    expect(screen.queryByRole('button', { name: 'Post' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('textbox'));
    const submit = screen.getByRole('button', { name: 'Post' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByRole('textbox'), '   ');
    expect(submit).toBeDisabled();
  });

  it('submits trimmed text once and clears the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PostCardComposer kind="card" onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox'), '  hello wall  ');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('hello wall', undefined);
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
  it('pending testimonials show the approval state and owner actions; published ones do not', () => {
    const { rerender } = render(
      <TributeCard
        status="pending"
        authorHandle="priya"
        body="Great"
        actions={<button type="button">Approve</button>}
      />,
    );
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument();
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
    expect(screen.queryByText('Waiting for approval')).not.toBeInTheDocument();
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
  it('shows a block as "Blocked"', () => {
    render(<PosseBadge state="BLOCKED" />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
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

describe('Wall', () => {
  it('shows an empty state when there are no cards, and no "older" button unless there is more', () => {
    render(<Fence />);
    expect(screen.getByText('No posts yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Older posts' })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Older posts' }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('is a labelled region', () => {
    render(<Fence />);
    expect(screen.getByRole('region', { name: 'The wall' })).toBeInTheDocument();
  });
});

describe('ChimeItem, TownHallCard, RanchHeader', () => {
  it('unread notifications are announced as unread', () => {
    render(
      <ul>
        <ChimeItem type="YO_DROPPED" text="Sneha dropped a Yo." createdAt={at} unread />
      </ul>,
    );
    expect(screen.getByText(/Unread:/)).toBeInTheDocument();
  });

  it('groups show visibility but no member counts', () => {
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
    expect(screen.getByText('Friend')).toBeInTheDocument();
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

describe('name badges', () => {
  it('an earned Trusted tick follows the name and is read as "Trusted"', async () => {
    const { container } = render(<RanchHeader displayName="Sneha Roy" handle="sneha" trusted />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sneha Roy (Trusted)');
    expect(screen.getByTitle('Trusted · earned from friends')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('the team account shows Verified only, never both', () => {
    render(<RanchHeader displayName="Howdy" handle="howdy" verified trusted />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('(Verified)');
    expect(h1).not.toHaveTextContent('Trusted');
  });

  it('a post author and a reply author carry the tick too', () => {
    render(card({ author: { ...author, trusted: true } }));
    expect(screen.getByText('(Trusted)', { exact: false })).toBeInTheDocument();
    render(<PostCardReply author={{ ...author, trusted: true }} body="nice" createdAt={at} />);
    expect(screen.getAllByTitle('Trusted · earned from friends')).toHaveLength(2);
  });
});
