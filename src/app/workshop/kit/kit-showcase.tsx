'use client';

import { useState, type ReactNode } from 'react';
import { LIMITS } from '@/shared/limits';
import { RELATIONSHIP_STATES } from '@/shared/relationship';
import {
  BellIcon,
  ChevronDownIcon,
  CloseIcon,
  FenceIcon,
  HomeIcon,
  TracksIcon,
  UsersIcon,
  PencilIcon,
  WhisperIcon,
} from '@/ui/icons';
import {
  Avatar,
  Badge,
  BottomNavigation,
  Button,
  Card,
  Checkbox,
  Chip,
  ClayCard,
  ConfirmationDialog,
  Dialog,
  Drawer,
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
  Skeleton,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  useToast,
} from '@/ui/primitives';
import {
  ChimeItem,
  Fence,
  PosseBadge,
  PostCard,
  PostCardComposer,
  PostCardReply,
  RanchHeader,
  Signal,
  TipHatButton,
  TownHallCard,
  TrackItem,
  TributeCard,
  WhisperBubble,
  YoButton,
} from '@/ui/howdy';
import type { Theme } from '@/ui/theme';
import { ThemeToggle } from '@/ui/theme-toggle';

// Static class map so Tailwind can see every utility (no dynamic class names).
const SWATCHES: { token: string; className: string }[] = [
  { token: 'background', className: 'bg-background' },
  { token: 'surface', className: 'bg-surface' },
  { token: 'surface-raised', className: 'bg-surface-raised' },
  { token: 'surface-sunken', className: 'bg-surface-sunken' },
  { token: 'parchment', className: 'bg-parchment' },
  { token: 'tribute', className: 'bg-tribute' },
  { token: 'accent', className: 'bg-accent' },
  { token: 'accent-soft', className: 'bg-accent-soft' },
  { token: 'success', className: 'bg-success' },
  { token: 'warning', className: 'bg-warning' },
  { token: 'danger', className: 'bg-danger' },
  { token: 'danger-soft', className: 'bg-danger-soft' },
  { token: 'info', className: 'bg-info' },
  { token: 'mystery', className: 'bg-mystery' },
  { token: 'text-primary', className: 'bg-text-primary' },
  { token: 'text-secondary', className: 'bg-text-secondary' },
  { token: 'text-muted', className: 'bg-text-muted' },
  { token: 'border-strong', className: 'bg-border-strong' },
  { token: 'link', className: 'bg-link' },
  { token: 'focus', className: 'bg-focus' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 font-display text-heading text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60_000);
const sneha = { name: 'Sneha Roy', handle: 'sneha' };
const rahul = { name: 'Rahul Das', handle: 'rahul' };

export function KitShowcase({ initialTheme }: { initialTheme: Theme | undefined }) {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sw, setSw] = useState(true);
  const [yo, setYo] = useState({ active: false, count: 14 });
  const [tipped, setTipped] = useState(false);
  const [chip, setChip] = useState(true);
  const [cards, setCards] = useState([
    {
      id: 1,
      author: sneha,
      body: 'Are we hitting the late-night canteen run, or are you ghosting again?',
      at: ago(18),
      stamp: 'North Gate',
    },
    { id: 2, author: rahul, body: 'Left your notes on the 2nd row table.', at: ago(75), stamp: 'CS Hall B' },
  ]);

  const nav = [
    { href: '/workshop/kit', label: 'Porch', icon: <HomeIcon />, current: true },
    { href: '#fence', label: 'Fence', icon: <FenceIcon /> },
    { href: '#tracks', label: 'Tracks', icon: <TracksIcon />, badge: '3 new' },
    { href: '#whispers', label: 'Whispers', icon: <WhisperIcon /> },
  ];

  return (
    <main id="main" className="mx-auto flex max-w-3xl flex-col gap-12 px-4 pt-8 pb-28 md:pb-12">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-display text-text-primary">Howdy design kit</h1>
        <p className="text-body text-text-secondary">
          Development-only gallery. Every component here is built from tokens; switch theme to check Daylight
          and Dusk.
        </p>
        <ThemeToggle initial={initialTheme} />
      </header>

      <Section title="Colour tokens">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map((s) => (
            <li key={s.token} className="flex flex-col gap-1.5">
              <span className={`${s.className} h-14 rounded-md border border-border`} />
              <span className="font-mono text-metadata text-text-secondary">{s.token}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-2">
          <p className="text-display font-display text-text-primary">Display — Fraunces</p>
          <p className="text-heading text-text-primary">Heading — Google Sans</p>
          <p className="text-title text-text-primary">Title — the quick brown fox</p>
          <p className="text-body text-text-primary">Body — Nail a card to the Fence. Short and sweet.</p>
          <p className="text-caption text-text-secondary">Caption — supporting detail</p>
          <p className="text-metadata text-text-muted">Metadata — @sneha · 18m ago</p>
          <p className="font-mono text-code text-text-primary">
            Code — const posse = [&apos;sneha&apos;, &apos;rahul&apos;];
          </p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Stake a Claim</Button>
          <Button variant="secondary">Step Inside</Button>
          <Button variant="ghost">Hit the Trail</Button>
          <Button variant="danger">Burn the Deed</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <IconButton label="Notifications" tone="accent">
            <BellIcon />
          </IconButton>
          <IconButton label="Close">
            <CloseIcon />
          </IconButton>
        </div>
      </Section>

      <Section title="Form controls">
        <ClayCard className="flex flex-col gap-4">
          <Input label="Handle" hint="Your call sign. 3–24 characters." placeholder="chiranjit" />
          <Input label="Secret Knock" type="password" error="That knock is too short." defaultValue="abc" />
          <Textarea label="Signal" showCount maxLength={LIMITS.SIGNAL_MAX} hint="Expires after 12 hours." />
          <Select label="Who can read your Fence?" defaultValue="posse">
            <option value="all">Anyone</option>
            <option value="posse">Pals only</option>
          </Select>
          <Checkbox label="Review cards before they go up" hint="Cards wait in your queue." />
          <fieldset className="flex flex-col">
            <legend className="text-caption font-semibold">Whisper permission</legend>
            <Radio name="whisper" label="Pals only" defaultChecked />
            <Radio name="whisper" label="Anyone can ask" />
          </fieldset>
          <Switch
            label="Shadow Walk"
            hint="Hide your visits. Your own Tracks freeze too."
            checked={sw}
            onCheckedChange={setSw}
          />
        </ClayCard>
      </Section>

      <Section title="Badges, chips, avatars">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="mystery">Mystery</Badge>
          <Chip selected={chip} onSelect={() => setChip((c) => !c)}>
            Toggle chip
          </Chip>
          <Chip onRemove={() => toast({ title: 'Chip removed' })} removeLabel="Remove campus filter">
            Campus West
          </Chip>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name="Sneha Roy" size="sm" />
          <Avatar name="Rahul Das" size="md" online />
          <Avatar name="Chiranjit Karmakar" size="lg" />
          <Avatar name="Priya" size="xl" />
        </div>
        <div className="flex flex-wrap gap-2">
          {RELATIONSHIP_STATES.map((s) => (
            <PosseBadge key={s} state={s} />
          ))}
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>Flat card</Card>
          <ClayCard>Clay card</ClayCard>
          <ClayCard interactive tabIndex={0}>
            Interactive clay card (press me)
          </ClayCard>
        </div>
      </Section>

      <Section title="Overlays & menus">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setModal(true)}>
            Modal
          </Button>
          <Button variant="secondary" onClick={() => setDrawer(true)}>
            Drawer
          </Button>
          <Button variant="secondary" onClick={() => setDialog(true)}>
            Dialog
          </Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Confirmation
          </Button>
          <Popover
            label="Boundary lines"
            trigger={(p, s) => (
              <Button variant="secondary" {...p}>
                Popover <ChevronDownIcon className={s.open ? 'rotate-180' : ''} />
              </Button>
            )}
          >
            <p className="text-caption text-text-secondary">
              Boundary Lines decide who can step onto your Porch.
            </p>
          </Popover>
          <Dropdown
            label="Card actions"
            trigger={(p) => (
              <Button variant="secondary" {...p}>
                Menu <ChevronDownIcon />
              </Button>
            )}
            items={[
              {
                id: 'scrape',
                label: 'Scrape clean',
                onSelect: () => toast({ title: 'Card scraped', tone: 'success' }),
              },
              { id: 'mute', label: 'Turn down the noise', onSelect: () => toast({ title: 'Muted' }) },
              {
                id: 'flag',
                label: 'Flag trouble',
                danger: true,
                onSelect: () => toast({ title: 'Reported', description: 'Thanks. We will take a look.' }),
              },
              { id: 'na', label: 'Unavailable', disabled: true, onSelect: () => undefined },
            ]}
          />
          <Tooltip content="Hover or focus for a hint">
            <Button variant="ghost">Tooltip</Button>
          </Tooltip>
          <Button
            variant="ghost"
            onClick={() =>
              toast({ title: 'Nailed to the Fence', description: 'Your card is up.', tone: 'success' })
            }
          >
            Toast
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast({ title: 'Could not send', description: 'Check your connection.', tone: 'danger' })
            }
          >
            Error toast
          </Button>
        </div>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="Tend your Porch"
          description="Edits appear as soon as you save."
        >
          <Input label="Display name" defaultValue="Chiranjit" />
          <Button onClick={() => setModal(false)}>Save</Button>
        </Modal>
        <Drawer
          open={drawer}
          onClose={() => setDrawer(false)}
          title="Boundary Lines"
          description="Who can do what on your Porch."
        >
          <Switch label="Show my Signal to passersby" checked={sw} onCheckedChange={setSw} />
        </Drawer>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="Whisper request"
          description="Alex would like to Whisper with you."
          actions={
            <>
              <Button variant="secondary" onClick={() => setDialog(false)}>
                Not now
              </Button>
              <Button onClick={() => setDialog(false)}>Accept</Button>
            </>
          }
        />
        <ConfirmationDialog
          open={confirm}
          destructive
          title="Burn the Deed?"
          description="This removes your Porch, cards and marks. It can’t be undone."
          confirmLabel="Burn it"
          onCancel={() => setConfirm(false)}
          onConfirm={() => setConfirm(false)}
        />
      </Section>

      <Section title="Tabs">
        <Tabs
          label="Porch sections"
          tabs={[
            {
              id: 'fence',
              label: 'Fence',
              panel: <p className="text-body text-text-secondary">Cards nailed to this Porch.</p>,
            },
            {
              id: 'tributes',
              label: 'Tributes',
              panel: <p className="text-body text-text-secondary">What friends say.</p>,
            },
            { id: 'posse', label: 'Pals', panel: <p className="text-body text-text-secondary">Mutuals.</p> },
          ]}
        />
      </Section>

      <Section title="States">
        <div className="grid gap-4 sm:grid-cols-2">
          <ClayCard>
            <LoadingState label="Fetching your Fence" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </ClayCard>
          <ClayCard>
            <EmptyState
              icon="👣"
              title="No tracks yet today"
              description="Footprints will show up here."
              action={<Button variant="secondary">Visit a Porch</Button>}
            />
          </ClayCard>
          <div className="sm:col-span-2">
            <ErrorState
              requestId="3f1c2b9e-0d54-4c1e-8a44-6b2f0e9d7a10"
              onRetry={() => toast({ title: 'Retrying…' })}
            />
          </div>
        </div>
      </Section>

      <Section title="Porch">
        <ClayCard>
          <RanchHeader
            displayName="Chiranjit Karmakar"
            handle="chiranjit"
            online
            relationship="POSSE"
            signal="Writing code. Send chai."
            signalExpiresLabel="11h left"
            actions={
              <>
                <TipHatButton tipped={tipped} onTip={() => setTipped(true)} />
                <YoButton
                  count={yo.count}
                  active={yo.active}
                  onToggle={() => setYo((y) => ({ active: !y.active, count: y.count + (y.active ? -1 : 1) }))}
                />
                <Button variant="secondary">
                  <WhisperIcon /> Whisper
                </Button>
              </>
            }
          />
        </ClayCard>
        <Signal text="Short signal" />
      </Section>

      <Section title="Fence & Post Cards">
        <div id="fence">
          <Fence
            composer={
              <PostCardComposer
                kind="card"
                onSubmit={(body) =>
                  setCards((c) => [
                    {
                      id: Date.now(),
                      author: { name: 'You', handle: 'you' },
                      body,
                      at: new Date(),
                      stamp: 'Campus West',
                    },
                    ...c,
                  ])
                }
              />
            }
            hasMore
            onLoadMore={() => toast({ title: 'Older cards would load here' })}
          >
            {cards.map((c) => (
              <PostCard
                key={c.id}
                author={c.author}
                body={c.body}
                createdAt={c.at}
                stamp={c.stamp}
                reactions={
                  c.id === 1
                    ? { yo: 9, laugh: 3, fire: 1, popcorn: 1, love: 0 }
                    : { yo: 4, laugh: 0, fire: 0, popcorn: 0, love: 0 }
                }
                myReaction={null}
                onReact={(kind) => toast({ title: kind ? `Reacted: ${kind}` : 'Reaction taken back' })}
                replyCount={c.id === 1 ? 2 : 0}
                replies={
                  c.id === 1 && (
                    <>
                      <PostCardReply author={rahul} body="Bringing coffee down now." createdAt={ago(10)} />
                      <PostCardReply
                        author={{ name: 'Chiranjit', handle: 'chiranjit' }}
                        body="Wait 5 mins."
                        createdAt={ago(6)}
                      />
                    </>
                  )
                }
                replyComposer={
                  <PostCardComposer kind="reply" onSubmit={() => toast({ title: 'Scribble added' })} />
                }
              />
            ))}
          </Fence>
        </div>
        <Fence>{null}</Fence>
      </Section>

      <Section title="Tributes">
        <TributeCard
          pinned
          status="published"
          authorHandle="alex"
          body="Built our entire backend over a single weekend. Absolute machine."
        />
        <TributeCard
          status="pending"
          authorHandle="priya"
          body="Terrible at FIFA, unbeatable at debugging."
          actions={
            <>
              <Button size="sm">Approve</Button>
              <Button size="sm" variant="secondary">
                Decline
              </Button>
            </>
          }
        />
      </Section>

      <Section title="Tracks">
        <ul id="tracks" className="flex flex-col gap-3">
          <TrackItem
            visitor={{ name: 'Alex Kumar', handle: 'alex' }}
            when="today"
            action={<TipHatButton tipped={false} onTip={() => undefined} />}
          />
          <TrackItem when="today" hint="Someone who shares 4 mutual friends stopped by." />
          <TrackItem when="this-week" />
        </ul>
      </Section>

      <Section title="Whispers">
        <div id="whispers" className="flex flex-col gap-3 rounded-lg bg-surface-sunken p-4">
          <WhisperBubble
            direction="in"
            body="Hey! Saw your card about the canteen run. Count me in."
            time="10:14 PM"
          />
          <WhisperBubble
            direction="out"
            body="Grabbing coffee first. Meet near the east gate in 10?"
            time="10:16 PM"
            status="seen"
          />
          <WhisperBubble direction="out" body="Bringing Rahul too." time="10:17 PM" status="sent" />
        </div>
      </Section>

      <Section title="Town Halls & Chimes">
        <TownHallCard
          name="Hostel B Night Owls"
          description="For anyone awake past 2am."
          visibility="members"
          joined
          action={
            <Button variant="secondary" size="sm">
              Open
            </Button>
          }
        />
        <TownHallCard
          name="Campus West Batch ’27"
          description="Notes, rants and canteen intel."
          visibility="open"
          action={<Button size="sm">Join</Button>}
        />
        <ul className="flex flex-col gap-2">
          <ChimeItem
            type="TRACK_CREATED"
            text="Someone left fresh Tracks on your Fence."
            createdAt={ago(12)}
            unread
            href="#tracks"
          />
          <ChimeItem type="YO_DROPPED" text="Sneha dropped a Yo on your card." createdAt={ago(120)} />
          <ChimeItem
            type="POSSE_REQUESTED"
            text="Alex wants to be your Pal."
            createdAt={ago(60 * 26)}
            unread
          />
        </ul>
      </Section>

      <Section title="Navigation">
        <Navigation label="Kit navigation" items={nav} className="max-w-xs" />
        <p className="flex items-center gap-2 text-caption text-text-secondary">
          <UsersIcon /> The bottom bar appears below the md breakpoint.
        </p>
      </Section>

      <BottomNavigation
        label="Primary"
        items={nav}
        action={{ href: '#fence', label: 'Nail', description: 'Nail a card', icon: <PencilIcon /> }}
      />
    </main>
  );
}
